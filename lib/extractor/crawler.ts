import type { DiscoveredPlace, ExtractedLead } from "./types";

const GENERIC_LOCAL_PARTS = new Set([
  "info",
  "contact",
  "support",
  "sales",
  "office",
  "admin",
  "administrator",
  "billing",
  "accounts",
  "marketing",
  "media",
  "press",
  "team",
  "hello",
  "help",
  "reception",
  "careers",
  "jobs",
  "hr",
  "humanresources",
  "webmaster",
  "postmaster",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "privacy",
  "legal",
  "security",
]);

const EMAIL_RE =
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi;

const COMMON_PATHS = [
  "/",
  "/about",
  "/about-us",
  "/team",
  "/our-team",
  "/people",
  "/professionals",
  "/attorneys",
  "/lawyers",
  "/contact",
];

function normalizeEmail(value: string) {
  return value
    .replace(/^mailto:/i, "")
    .split("?")[0]
    .trim()
    .toLowerCase();
}

function validEmail(email: string) {
  if (!EMAIL_RE.test(email)) return false;

  const [local] = email.split("@");
  if (!local || GENERIC_LOCAL_PARTS.has(local)) return false;
  if (local.length < 3 || local.length > 80) return false;

  return true;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
}

async function allowedByRobots(origin: string) {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: {
        "User-Agent":
          "LexSorter/1.0 (+https://lexsorter.vercel.app; public-web-research)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 404) return true;
    if (!response.ok) return true;

    const text = await response.text();

    let inOurGroup = false;
    let applies = false;
    const disallow: string[] = [];
    const allow: string[] = [];

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.split("#")[0].trim();
      if (!line) continue;

      const [rawKey, ...rest] = line.split(":");
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(":").trim();

      if (key === "user-agent") {
        inOurGroup =
          value === "*" ||
          value.toLowerCase().includes("lexsorter");
        if (inOurGroup) applies = true;
        continue;
      }

      if (!inOurGroup) continue;

      if (key === "disallow" && value) disallow.push(value);
      if (key === "allow" && value) allow.push(value);
    }

    if (!applies) return true;

    const path = new URL(origin).pathname || "/";

    const blocked = disallow
      .filter((rule) => rule && path.startsWith(rule))
      .sort((a, b) => b.length - a.length)[0];

    const permitted = allow
      .filter((rule) => rule && path.startsWith(rule))
      .sort((a, b) => b.length - a.length)[0];

    if (!blocked) return true;
    if (permitted && permitted.length >= blocked.length) return true;

    return false;
  } catch {
    return true;
  }
}

async function fetchPage(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "LexSorter/1.0 (+https://lexsorter.vercel.app; public-web-research)",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return null;

  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html") && !type.includes("application/xhtml")) {
    return null;
  }

  const text = await response.text();
  if (text.length > 3_000_000) return text.slice(0, 3_000_000);

  return text;
}

function extractLinks(html: string, origin: string) {
  const links = new Set<string>();

  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html))) {
    try {
      const url = new URL(match[1], origin);

      if (url.origin !== origin) continue;
      if (!["http:", "https:"].includes(url.protocol)) continue;

      url.hash = "";

      const pathname = url.pathname.toLowerCase();

      if (
        pathname.endsWith(".pdf") ||
        pathname.endsWith(".jpg") ||
        pathname.endsWith(".jpeg") ||
        pathname.endsWith(".png") ||
        pathname.endsWith(".gif") ||
        pathname.endsWith(".zip")
      ) {
        continue;
      }

      links.add(url.toString());
    } catch {}
  }

  return [...links];
}

export async function crawlPlace(
  place: DiscoveredPlace,
  profession: string
): Promise<ExtractedLead[]> {
  if (!place.website) return [];

  let base: URL;

  try {
    base = new URL(place.website);
  } catch {
    return [];
  }

  if (!(await allowedByRobots(base.origin))) return [];

  const queue = COMMON_PATHS.map((path) => new URL(path, base.origin).toString());
  const visited = new Set<string>();
  const emails = new Set<string>();

  while (queue.length && visited.size < 8) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    let html: string | null = null;

    try {
      html = await fetchPage(url);
    } catch {
      continue;
    }

    if (!html) continue;

    for (const raw of html.match(EMAIL_RE) || []) {
      const email = normalizeEmail(raw);
      if (validEmail(email)) emails.add(email);
    }

    for (const link of extractLinks(html, base.origin)) {
      if (visited.has(link) || queue.includes(link)) continue;

      const path = new URL(link).pathname.toLowerCase();

      if (
        /about|team|people|professional|attorney|lawyer|contact|staff|expert/.test(
          path
        )
      ) {
        queue.push(link);
      }
    }
  }

  return [...emails].map((email) => ({
    person: "",
    profession,
    company: place.name,
    email,
    location: place.address || "",
    source: place.website || "",
  }));
}
