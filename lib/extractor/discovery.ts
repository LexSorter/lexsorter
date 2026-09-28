import type { ExtractorQuery, DiscoveredPlace } from "./types";

function decodeUrl(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function extractUrls(html: string): string[] {
  const urls = new Set<string>();

  const patterns = [
    /uddg=([^&"']+)/g,
    /class="result__a"[^>]+href="([^"]+)"/g,
    /class='result__a'[^>]+href='([^']+)'/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      const raw = decodeUrl(match[1]);
      if (!raw.startsWith("http")) continue;

      try {
        const url = new URL(raw);
        if (url.protocol === "http:" || url.protocol === "https:") {
          url.hash = "";
          urls.add(url.toString());
        }
      } catch {}
    }
  }

  return [...urls];
}

function cleanTitle(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractResults(html: string): DiscoveredPlace[] {
  const results: DiscoveredPlace[] = [];
  const seen = new Set<string>();

  const blocks = html.split(/result__body|result results_links/g).slice(1);

  for (const block of blocks) {
    const url = extractUrls(block)[0];
    if (!url) continue;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }

    const titleMatch =
      block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/class='result__a'[^>]*>([\s\S]*?)<\/a>/i);

    const name = cleanTitle(titleMatch?.[1] || parsed.hostname);

    if (seen.has(parsed.origin)) continue;
    seen.add(parsed.origin);

    results.push({
      id: parsed.origin,
      name,
      website: parsed.origin,
    });
  }

  return results;
}

async function searchDuckDuckGo(query: string): Promise<DiscoveredPlace[]> {
  const url =
    "https://html.duckduckgo.com/html/?q=" +
    encodeURIComponent(query) +
    "&kl=us-en";

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "LexSorter/1.0 (+https://lexsorter.vercel.app; public-web-research)",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) return [];

  const html = await response.text();
  return extractResults(html);
}

export async function discover(query: ExtractorQuery): Promise<DiscoveredPlace[]> {
  const location = [query.city, query.state, query.country]
    .filter(Boolean)
    .join(", ");

  const profession = query.profession || "professional";

  const searches = [
    `"${profession}" "${location}" email`,
    `${profession} ${location} contact`,
    `${profession} ${location} "@"`,
    `${profession} ${location} professionals`,
  ];

  const all: DiscoveredPlace[] = [];
  const seen = new Set<string>();

  for (const search of searches) {
    try {
      const results = await searchDuckDuckGo(search);

      for (const result of results) {
        if (!result.website) continue;

        try {
          const origin = new URL(result.website).origin;
          if (seen.has(origin)) continue;
          seen.add(origin);
          all.push(result);
        } catch {}
      }
    } catch {}
  }

  return all.slice(0, 40);
}
