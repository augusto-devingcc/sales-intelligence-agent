import * as cheerio from "cheerio";
import type { ScrapeResult } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SalesIntelligenceAgent/1.0; +https://sales-intel.workfuelai.app)";

export async function webScrape(url: string): Promise<ScrapeResult> {
  const target = normalizeUrl(url);
  const res = await fetch(target, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Fetch failed for ${target}: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  $("script, style, noscript, svg, iframe").remove();

  const title = $("title").first().text().trim() || null;
  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const text = bodyText.slice(0, 8000);

  const origin = new URL(target).origin;
  const navLinks = new Set<string>();
  $("nav a[href], header a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, origin).toString();
      if (abs.startsWith(origin)) navLinks.add(abs);
    } catch {
      // ignore malformed
    }
  });

  return {
    url: target,
    title,
    description,
    text,
    nav_links: Array.from(navLinks).slice(0, 30),
  };
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
