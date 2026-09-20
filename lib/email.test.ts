import { describe, expect, it } from "vitest";
import { extractEmailCandidates, getEmailDomain, isValidEmail, prepareEmails } from "./email";

describe("email preparation", () => {
  it("extracts addresses from mixed content and normalizes them", () => {
    expect(extractEmailCandidates("Name <Alex@Example.COM>, sam@test.org")).toEqual([
      "alex@example.com",
      "sam@test.org",
    ]);
  });

  it("deduplicates case-insensitively", () => {
    expect(prepareEmails(["Alex@Example.com", "alex@example.com", "sam@test.org"])).toEqual({
      emails: ["alex@example.com", "sam@test.org"],
      duplicatesRemoved: 1,
    });
  });

  it("validates syntax without claiming mailbox existence", () => {
    expect(isValidEmail("valid.name+tag@example.co.uk")).toBe(true);
    expect(isValidEmail("missing-tld@example")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
  });

  it("extracts the normalized domain", () => {
    expect(getEmailDomain("user@sub.example.com")).toBe("sub.example.com");
  });
});
