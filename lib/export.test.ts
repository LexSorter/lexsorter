import { describe, expect, it } from "vitest";
import { buildTextExport, cleanExportFilename } from "./export";

describe("TXT exports", () => {
  it("adds the TXT extension to a meaningful filename", () => {
    expect(cleanExportFilename("September Gmail Leads")).toBe("September Gmail Leads.txt");
  });

  it("sanitizes filename characters that file systems reject", () => {
    expect(cleanExportFilename("Gmail: September/West.txt")).toBe("Gmail- September-West.txt");
  });

  it("writes one email per line with a final newline", () => {
    expect(buildTextExport(["a@example.com", "b@example.com"])).toBe(
      "a@example.com\nb@example.com\n",
    );
  });
});
