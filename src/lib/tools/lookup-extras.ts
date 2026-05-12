import * as cheerio from "cheerio";
import type { CompanyExtras } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SalesIntelligenceAgent/1.0; +https://sales-intel.workfuelai.app)";

const SOCIAL_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: "linkedin", re: /linkedin\.com\/(company|in)\/[^\s"'<>?#]+/i },
  { key: "twitter", re: /(?:twitter|x)\.com\/[a-z0-9_]+/i },
  { key: "github", re: /github\.com\/[a-z0-9-]+/i },
  { key: "youtube", re: /youtube\.com\/(c\/|channel\/|@)[^\s"'<>?#]+/i },
  { key: "instagram", re: /instagram\.com\/[a-z0-9._]+/i },
];

export async function lookupCompanyExtras(domain: string): Promise<CompanyExtras> {
  const origin = `https://${domain}`;
  const candidates = [origin, `${origin}/about`, `${origin}/company`];
  const social_links: Record<string, string> = {};
  let combinedText = "";

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      $("script, style, noscript").remove();
      combinedText += " " + $("body").text();

      for (const { key, re } of SOCIAL_PATTERNS) {
        if (social_links[key]) continue;
        const match = html.match(re);
        if (match) social_links[key] = `https://${match[0].replace(/^https?:\/\//i, "")}`;
      }
    } catch {
      // ignore individual failures
    }
  }

  const founded_year = extractFoundedYear(combinedText);
  const location = extractLocation(combinedText);

  return { founded_year, location, social_links };
}

function extractFoundedYear(text: string): number | null {
  const patterns = [
    /founded in (\d{4})/i,
    /est(?:ablished)?\.?\s+(?:in\s+)?(\d{4})/i,
    /since (\d{4})/i,
  ];
  const currentYear = new Date().getFullYear();
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const year = parseInt(m[1], 10);
      if (year >= 1900 && year <= currentYear) return year;
    }
  }
  return null;
}

function extractLocation(text: string): string | null {
  const patterns = [
    /headquartered in ([A-Z][a-zA-Z. ]+(?:,\s*[A-Z][a-zA-Z. ]+){0,2})/,
    /based in ([A-Z][a-zA-Z. ]+(?:,\s*[A-Z][a-zA-Z. ]+){0,2})/,
    /HQ:?\s*([A-Z][a-zA-Z. ]+(?:,\s*[A-Z][a-zA-Z. ]+){0,2})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].trim().slice(0, 80);
  }
  return null;
}
