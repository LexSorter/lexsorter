import { resolveDomain } from "@/lib/dns";
import type { ResolveResponse } from "@/lib/types";

export const maxDuration = 60;
export const runtime = "nodejs";

const MAX_DOMAINS_PER_REQUEST = 200;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawDomains =
    typeof payload === "object" && payload !== null && "domains" in payload
      ? (payload as { domains?: unknown }).domains
      : undefined;

  if (!Array.isArray(rawDomains)) {
    return Response.json({ error: "domains must be an array" }, { status: 400 });
  }

  const domains = [...new Set(rawDomains)]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => DOMAIN_PATTERN.test(value));

  if (domains.length === 0) {
    return Response.json({ results: [] } satisfies ResolveResponse);
  }

  if (domains.length > MAX_DOMAINS_PER_REQUEST) {
    return Response.json(
      { error: `A maximum of ${MAX_DOMAINS_PER_REQUEST} domains is allowed per request` },
      { status: 413 },
    );
  }

  const results = await mapWithConcurrency(domains, 24, resolveDomain);
  return Response.json({ results } satisfies ResolveResponse);
}
