import type { ProviderName } from "./types";

export type ProviderRule = {
  name: ProviderName;
  priority: number;
  domains?: string[];
  mx?: string[];
};

export function matchesPattern(value: string, pattern: string): boolean {
  const escaped = pattern
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

export function classifyWithRules(
  domain: string,
  mxHosts: string[],
  providerRules: ProviderRule[],
): ProviderName {
  const normalizedDomain = domain.toLowerCase();
  const normalizedMx = mxHosts.map((host) => host.replace(/\.$/, "").toLowerCase());
  const rules = [...providerRules].sort((a, b) => b.priority - a.priority);

  // Address-domain ownership is canonical. This keeps consumer domains such
  // as outlook.com classified as Microsoft while the same hosted MX used by a
  // private organization is classified by the infrastructure rule below.
  for (const rule of rules) {
    if (rule.domains?.some((pattern) => matchesPattern(normalizedDomain, pattern))) {
      return rule.name;
    }
  }

  // MX matching is only considered when no canonical address-domain rule won.
  for (const rule of rules) {
    if (rule.mx?.some((pattern) => normalizedMx.some((host) => matchesPattern(host, pattern)))) {
      return rule.name;
    }
  }

  return "Others";
}
