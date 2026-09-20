import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { classifyWithRules, type ProviderRule } from "./provider-matcher";
import type { ProviderName } from "./types";

type ProviderRegistry = {
  providers: ProviderRule[];
};

let cachedRules: ProviderRule[] | undefined;

function loadRules(): ProviderRule[] {
  if (cachedRules) return cachedRules;

  const source = readFileSync(join(process.cwd(), "providers.yaml"), "utf8");
  const registry = parse(source) as ProviderRegistry;

  if (!Array.isArray(registry.providers)) {
    throw new Error("providers.yaml must contain a providers list");
  }

  cachedRules = registry.providers
    .map((rule) => ({
      ...rule,
      domains: rule.domains?.map((value) => value.toLowerCase()),
      mx: rule.mx?.map((value) => value.toLowerCase()),
    }))
    .sort((a, b) => b.priority - a.priority);

  return cachedRules;
}

export function classifyProvider(domain: string, mxHosts: string[]): ProviderName {
  return classifyWithRules(domain, mxHosts, loadRules());
}
