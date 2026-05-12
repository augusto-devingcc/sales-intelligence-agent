import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  Tool,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages.js";

import { supabaseServer } from "@/lib/supabase-server";
import { webScrape } from "@/lib/tools/web-scrape";
import { classifyCompany } from "@/lib/tools/classify-company";
import { lookupCompanyExtras } from "@/lib/tools/lookup-extras";
import { generateOutboundEmail } from "@/lib/tools/generate-email";
import type {
  AgentStep,
  Classification,
  GeneratedEmail,
} from "@/lib/tools/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AGENT_MODEL = "claude-opus-4-7";
const MAX_ITERATIONS = 8;
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const TOOLS: Tool[] = [
  {
    name: "web_scrape",
    description:
      "Fetch a URL and extract page title, meta description, body text (max 8000 chars), and nav links. Use this to read company homepage, /about, /pricing, etc.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute URL to fetch." },
      },
      required: ["url"],
    },
  },
  {
    name: "classify_company",
    description:
      "Classify a company from raw website text. Returns industry, size_estimate, tech_stack, description, and pain_points as structured JSON.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Raw company website text." },
        domain: { type: "string", description: "Company domain." },
      },
      required: ["text", "domain"],
    },
  },
  {
    name: "lookup_company_extras",
    description:
      "Heuristic enrichment from /about and /company pages. Returns founded_year, location, and social_links.",
    input_schema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Company domain (no protocol)." },
      },
      required: ["domain"],
    },
  },
  {
    name: "generate_outbound_email",
    description:
      "Draft a personalized cold email referencing the enriched company data. Returns {subject, body}.",
    input_schema: {
      type: "object",
      properties: {
        company: {
          type: "object",
          description: "Company data: domain, name, industry, description, pain_points, tech_stack.",
        },
        sender_context: {
          type: "string",
          description: "Optional sender bio. Defaults to Augusto's AI automation positioning.",
        },
      },
      required: ["company"],
    },
  },
  {
    name: "save_run",
    description:
      "Persist the final enrichment result and conclude the loop. Call this once at the end with the final classification and generated_email. After this, stop.",
    input_schema: {
      type: "object",
      properties: {
        classification: { type: "object" },
        generated_email: {
          type: "object",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["subject", "body"],
        },
        company_name: { type: "string" },
      },
      required: ["classification", "generated_email"],
    },
  },
];

const SYSTEM_PROMPT = `You are a sales intelligence agent. Given a company domain, you autonomously enrich it and draft a cold outbound email.

Typical flow:
1. web_scrape the company homepage at https://{domain}
2. Optionally web_scrape /about or /pricing if the nav links suggest they exist
3. classify_company with the combined scraped text
4. lookup_company_extras for founded_year, location, social links
5. generate_outbound_email with the company data
6. save_run with the final classification and email, then stop

Rules:
- Be efficient. Do not scrape more than 3 URLs.
- Keep brief reasoning between tool calls (one sentence).
- Always end by calling save_run, then output a short final summary.
- The sender is Augusto Garcia, AI Automation Engineer. The email pitch is a 2-week paid pilot building Claude agents or MCP servers for the prospect.`;

type SSEController = ReadableStreamDefaultController<Uint8Array>;

function sseSend(controller: SSEController, event: string, data: unknown) {
  const encoder = new TextEncoder();
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(encoder.encode(payload));
}

function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

export async function POST(request: Request) {
  let body: { domain?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawDomain = body?.domain;
  if (!rawDomain || typeof rawDomain !== "string") {
    return Response.json({ error: "Missing 'domain' in body." }, { status: 400 });
  }
  const domain = normalizeDomain(rawDomain);
  if (!DOMAIN_REGEX.test(domain)) {
    return Response.json({ error: `Invalid domain: ${domain}` }, { status: 400 });
  }

  const { data: runRow, error: insertErr } = await supabaseServer
    .from("enrichment_runs")
    .insert({ domain, status: "running", claude_model: AGENT_MODEL })
    .select("id")
    .single();

  if (insertErr || !runRow) {
    return Response.json(
      { error: `Failed to create run: ${insertErr?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }
  const runId = runRow.id as string;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const steps: AgentStep[] = [];
      let totalTokens = 0;
      let finalClassification: Classification | null = null;
      let finalEmail: GeneratedEmail | null = null;
      let companyName: string | null = null;

      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const messages: MessageParam[] = [
        { role: "user", content: `Enrich the company at domain: ${domain}` },
      ];

      const finish = async (status: "completed" | "failed", errorMessage?: string) => {
        await supabaseServer
          .from("enrichment_runs")
          .update({
            status,
            agent_steps: steps,
            classification: finalClassification,
            generated_email: finalEmail
              ? `Subject: ${finalEmail.subject}\n\n${finalEmail.body}`
              : null,
            error_message: errorMessage ?? null,
            total_tokens: totalTokens,
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);

        if (status === "completed" && finalClassification) {
          await supabaseServer.from("companies").upsert(
            {
              domain,
              name: companyName,
              industry: finalClassification.industry,
              size_estimate: finalClassification.size_estimate,
              tech_stack: finalClassification.tech_stack,
              description: finalClassification.description,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "domain" }
          );
        }
      };

      try {
        sseSend(controller, "run_started", { run_id: runId, domain });

        for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
          sseSend(controller, "iteration", { iteration, max: MAX_ITERATIONS });

          let response: Message;
          try {
            response = await client.messages.create({
              model: AGENT_MODEL,
              max_tokens: 2048,
              system: SYSTEM_PROMPT,
              tools: TOOLS,
              messages,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Anthropic API error";
            throw new Error(`Agent call failed: ${msg}`);
          }

          totalTokens += response.usage.input_tokens + response.usage.output_tokens;

          for (const block of response.content) {
            if (block.type === "text" && block.text.trim().length > 0) {
              sseSend(controller, "assistant_text", { text: block.text });
            }
          }

          const toolUses = response.content.filter(
            (b): b is ToolUseBlock => b.type === "tool_use"
          );

          messages.push({ role: "assistant", content: response.content });

          if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
            break;
          }

          const toolResults: Array<{
            type: "tool_result";
            tool_use_id: string;
            content: string;
            is_error?: boolean;
          }> = [];

          for (const toolUse of toolUses) {
            const args = (toolUse.input ?? {}) as Record<string, unknown>;
            sseSend(controller, "step_start", {
              tool: toolUse.name,
              args,
              iteration,
            });
            const startedAt = Date.now();

            let result: unknown;
            let isError = false;
            try {
              result = await runTool(client, toolUse.name, args, {
                onSaveRun: (payload) => {
                  finalClassification = payload.classification;
                  finalEmail = payload.generated_email;
                  if (payload.company_name) companyName = payload.company_name;
                },
              });
              if (toolUse.name === "classify_company" && result && typeof result === "object") {
                const r = result as { classification?: Classification; tokens?: number };
                if (r.tokens) totalTokens += r.tokens;
                if (r.classification) result = r.classification;
              }
              if (toolUse.name === "generate_outbound_email" && result && typeof result === "object") {
                const r = result as { email?: GeneratedEmail; tokens?: number };
                if (r.tokens) totalTokens += r.tokens;
                if (r.email) result = r.email;
              }
            } catch (err) {
              isError = true;
              result = {
                error: err instanceof Error ? err.message : "Tool execution failed",
              };
            }

            const duration_ms = Date.now() - startedAt;
            steps.push({
              tool: toolUse.name,
              args,
              result,
              duration_ms,
              iteration,
            });

            sseSend(controller, "step_result", {
              tool: toolUse.name,
              result,
              duration_ms,
              is_error: isError,
              iteration,
            });

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify(result).slice(0, 12000),
              is_error: isError || undefined,
            });
          }

          messages.push({ role: "user", content: toolResults });

          if (finalClassification && finalEmail) {
            // Allow one more iteration for the final summary text, then break.
            // But to keep the loop bounded, break here.
            break;
          }
        }

        if (!finalClassification || !finalEmail) {
          throw new Error(
            "Agent finished without calling save_run. Final state missing classification or email."
          );
        }

        sseSend(controller, "final", {
          classification: finalClassification,
          generated_email: finalEmail,
          company_name: companyName,
          total_tokens: totalTokens,
          iterations: steps.length,
        });

        await finish("completed");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        sseSend(controller, "error", { message });
        await finish("failed", message);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

type SaveRunArgs = {
  classification: Classification;
  generated_email: GeneratedEmail;
  company_name?: string;
};

async function runTool(
  client: Anthropic,
  name: string,
  args: Record<string, unknown>,
  hooks: { onSaveRun: (payload: SaveRunArgs) => void }
): Promise<unknown> {
  switch (name) {
    case "web_scrape": {
      const url = String(args.url ?? "");
      if (!url) throw new Error("web_scrape: missing 'url'");
      return webScrape(url);
    }
    case "classify_company": {
      const text = String(args.text ?? "");
      const domain = String(args.domain ?? "");
      if (!text || !domain) throw new Error("classify_company: missing 'text' or 'domain'");
      return classifyCompany(client, text, domain);
    }
    case "lookup_company_extras": {
      const domain = String(args.domain ?? "");
      if (!domain) throw new Error("lookup_company_extras: missing 'domain'");
      return lookupCompanyExtras(domain);
    }
    case "generate_outbound_email": {
      const company = (args.company ?? {}) as Record<string, unknown>;
      const senderContext = typeof args.sender_context === "string" ? args.sender_context : undefined;
      return generateOutboundEmail(
        client,
        {
          domain: String(company.domain ?? ""),
          name: (company.name as string | null) ?? null,
          industry: (company.industry as string | null) ?? null,
          description: (company.description as string | null) ?? null,
          pain_points: Array.isArray(company.pain_points) ? (company.pain_points as string[]) : [],
          tech_stack: Array.isArray(company.tech_stack) ? (company.tech_stack as string[]) : [],
        },
        senderContext
      );
    }
    case "save_run": {
      const classification = (args.classification ?? null) as Classification | null;
      const email = (args.generated_email ?? null) as GeneratedEmail | null;
      const companyName = typeof args.company_name === "string" ? args.company_name : undefined;
      if (!classification || !email) {
        throw new Error("save_run: classification and generated_email are required");
      }
      hooks.onSaveRun({
        classification,
        generated_email: email,
        company_name: companyName,
      });
      return { ok: true, persisted: true };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
