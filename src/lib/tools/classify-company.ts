import Anthropic from "@anthropic-ai/sdk";
import type { Classification } from "./types";

const CLASSIFY_MODEL = "claude-haiku-4-5-20251001";

export async function classifyCompany(
  client: Anthropic,
  text: string,
  domain: string
): Promise<{ classification: Classification; tokens: number }> {
  const response = await client.messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 1024,
    system:
      "You are a B2B sales research analyst. Given raw text from a company's website, return a strict JSON object describing the company. Output JSON only, no prose, no markdown fences.",
    messages: [
      {
        role: "user",
        content: `Domain: ${domain}\n\nWebsite text:\n${text.slice(0, 6000)}\n\nReturn JSON with this exact shape:\n{\n  "industry": string | null,\n  "size_estimate": "1-10" | "11-50" | "51-200" | "201-1000" | "1000+" | null,\n  "tech_stack": string[],\n  "description": string,\n  "pain_points": string[]\n}\n\nKeep description under 280 characters. List 2-5 plausible pain points a vendor selling AI automation could solve. Output JSON only.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "{}";
  const classification = parseClassification(raw);
  const tokens = response.usage.input_tokens + response.usage.output_tokens;
  return { classification, tokens };
}

function parseClassification(raw: string): Classification {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<Classification>;
    return {
      industry: parsed.industry ?? null,
      size_estimate: parsed.size_estimate ?? null,
      tech_stack: Array.isArray(parsed.tech_stack) ? parsed.tech_stack : [],
      description: parsed.description ?? null,
      pain_points: Array.isArray(parsed.pain_points) ? parsed.pain_points : [],
    };
  } catch {
    return {
      industry: null,
      size_estimate: null,
      tech_stack: [],
      description: null,
      pain_points: [],
    };
  }
}
