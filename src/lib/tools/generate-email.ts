import Anthropic from "@anthropic-ai/sdk";
import type { GeneratedEmail } from "./types";

const EMAIL_MODEL = "claude-sonnet-4-6";

const DEFAULT_SENDER_CONTEXT =
  "Augusto Garcia, AI Automation Engineer. Builds Claude agents, RAG pipelines, and custom MCP servers for B2B teams. Offers a 2-week paid pilot that ships a working agent into production.";

type CompanyInput = {
  domain: string;
  name?: string | null;
  industry?: string | null;
  description?: string | null;
  pain_points?: string[];
  tech_stack?: string[];
};

export async function generateOutboundEmail(
  client: Anthropic,
  company: CompanyInput,
  senderContext: string = DEFAULT_SENDER_CONTEXT
): Promise<{ email: GeneratedEmail; tokens: number }> {
  const response = await client.messages.create({
    model: EMAIL_MODEL,
    max_tokens: 800,
    system:
      "You write short, specific B2B cold emails. No fluff, no superlatives, no em-dashes. Write like a calm engineer who has done their homework. Reference one concrete detail about the target company. Soft CTA only. Output strict JSON: {\"subject\": string, \"body\": string}. No markdown fences.",
    messages: [
      {
        role: "user",
        content: `Target company:\n${JSON.stringify(company, null, 2)}\n\nSender:\n${senderContext}\n\nWrite a 90-130 word cold email. Subject under 60 chars. Body opens with one sentence that proves research (cite a real detail from the company data), names one likely pain, suggests how an AI agent could help in one sentence, and ends with a 1-line soft CTA. Sign off "Augusto". Output JSON only.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "{}";
  const email = parseEmail(raw);
  const tokens = response.usage.input_tokens + response.usage.output_tokens;
  return { email, tokens };
}

function parseEmail(raw: string): GeneratedEmail {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<GeneratedEmail>;
    return {
      subject: (parsed.subject ?? "Quick idea").toString(),
      body: (parsed.body ?? "").toString(),
    };
  } catch {
    return { subject: "Quick idea", body: cleaned };
  }
}
