import "server-only";

import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import { classifyProvider } from "./providers";
import type { DomainClassification } from "./types";

const DNS_TIMEOUT_MS = 7_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("DNS lookup timed out")), DNS_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function hasAddressFallback(domain: string): Promise<boolean> {
  const [ipv4, ipv6] = await Promise.allSettled([
    withTimeout(resolve4(domain)),
    withTimeout(resolve6(domain)),
  ]);

  return (
    (ipv4.status === "fulfilled" && ipv4.value.length > 0) ||
    (ipv6.status === "fulfilled" && ipv6.value.length > 0)
  );
}

function dnsReason(error: unknown): string {
  if (error instanceof Error) {
    const code = "code" in error ? String(error.code) : "";
    if (code === "ENOTFOUND" || code === "ENODATA") return "Domain does not resolve";
    if (code === "ETIMEOUT") return "DNS lookup timed out";
    return error.message || "DNS lookup failed";
  }
  return "DNS lookup failed";
}

export async function resolveDomain(domain: string): Promise<DomainClassification> {
  try {
    const records = await withTimeout(resolveMx(domain));
    const usableRecords = records.filter((record) => record.exchange && record.exchange !== ".");

    if (usableRecords.length > 0) {
      const mx = usableRecords
        .sort((a, b) => a.priority - b.priority)
        .map((record) => record.exchange.replace(/\.$/, "").toLowerCase());

      return {
        domain,
        provider: classifyProvider(domain, mx),
        mx,
        status: "mx",
      };
    }

    if (records.some((record) => record.exchange === ".")) {
      return {
        domain,
        provider: "Dead",
        mx: [],
        status: "dead",
        reason: "Domain explicitly does not accept email",
      };
    }
  } catch (error) {
    const fallback = await hasAddressFallback(domain);
    if (fallback) {
      return {
        domain,
        provider: classifyProvider(domain, []),
        mx: [],
        status: "fallback",
        reason: "No MX record; address record fallback is available",
      };
    }

    return {
      domain,
      provider: "Dead",
      mx: [],
      status: "dead",
      reason: dnsReason(error),
    };
  }

  const fallback = await hasAddressFallback(domain);
  if (fallback) {
    return {
      domain,
      provider: classifyProvider(domain, []),
      mx: [],
      status: "fallback",
      reason: "No MX record; address record fallback is available",
    };
  }

  return {
    domain,
    provider: "Dead",
    mx: [],
    status: "dead",
    reason: "No usable mail infrastructure",
  };
}
