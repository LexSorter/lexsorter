import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { classifyWithRules, matchesPattern, type ProviderRule } from "./provider-matcher";

const rules = (parse(readFileSync(join(process.cwd(), "providers.yaml"), "utf8")) as {
  providers: ProviderRule[];
}).providers;

describe("provider registry", () => {
  it("supports exact and wildcard MX matches", () => {
    expect(matchesPattern("tenant.mail.protection.outlook.com", "*.mail.protection.outlook.com")).toBe(true);
    expect(matchesPattern("mail.example.com", "mx.example.com")).toBe(false);
  });

  it("classifies gmail.com as Gmail", () => {
    expect(classifyWithRules("gmail.com", ["gmail-smtp-in.l.google.com"], rules)).toBe(
      "Gmail",
    );
  });

  it("classifies a private domain on Google Workspace as GSuite", () => {
    expect(classifyWithRules("company.example", ["aspmx.l.google.com"], rules)).toBe(
      "GSuite",
    );
  });

  it.each(["outlook.com", "hotmail.com", "live.com"])(
    "classifies the consumer Microsoft domain %s as Microsoft",
    (domain) => {
      expect(
        classifyWithRules(domain, [`${domain.replaceAll(".", "-")}.mail.protection.outlook.com`], rules),
      ).toBe("Microsoft");
    },
  );

  it("classifies a private domain on Microsoft-hosted MX as Office 365", () => {
    expect(
      classifyWithRules("company.example", ["company.mail.protection.outlook.com"], rules),
    ).toBe("Office 365");
  });

  it.each(["university.edu", "school.k12.xx.us"])(
    "classifies the organizational domain %s on Microsoft-hosted MX as Office 365",
    (domain) => {
      expect(
        classifyWithRules(domain, [`${domain.replaceAll(".", "-")}.mail.protection.outlook.com`], rules),
      ).toBe("Office 365");
    },
  );

  it("recognizes other Exchange Online MX patterns as Office 365", () => {
    expect(classifyWithRules("company.example", ["outlook.office365.com"], rules)).toBe(
      "Office 365",
    );
  });

  it("falls back to Others for unknown valid infrastructure", () => {
    expect(classifyWithRules("example.com", ["mx.example.com"], rules)).toBe("Others");
  });
});
