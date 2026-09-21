import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DISPLAY_CATEGORIES } from "@/lib/types";
import type { SavedListSummary } from "@/lib/saved-lists/types";
import SavedListsPanel from "./saved-lists-panel";

const summary: SavedListSummary = {
  jobId: "saved-job-000000000001",
  title: "September Leads — Sep 20, 2026",
  createdAt: Date.UTC(2026, 8, 20),
  expiresAt: Date.UTC(2026, 11, 19),
  originalInputCount: 1_205,
  normalizedUniqueCount: 1_203,
  duplicatesRemoved: 2,
  domainCount: 94,
  providerCounts: Object.fromEntries(
    DISPLAY_CATEGORIES.map((provider) => [provider, provider === "Gmail" ? 1_203 : 0]),
  ) as SavedListSummary["providerCounts"],
};

describe("SavedListsPanel", () => {
  it("renders saved metadata and Open/Delete controls", () => {
    const markup = renderToStaticMarkup(
      <SavedListsPanel
        lists={[summary]}
        loading={false}
        busyJobId=""
        message=""
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(markup).toContain("September Leads — Sep 20, 2026");
    expect(markup).toContain("1,203 emails");
    expect(markup).toContain("Created");
    expect(markup).toContain("Expires");
    expect(markup).toContain(">Open<");
    expect(markup).toContain(">Delete<");
  });

  it("renders a lightweight empty state without result actions", () => {
    const markup = renderToStaticMarkup(
      <SavedListsPanel
        lists={[]}
        loading={false}
        busyJobId=""
        message=""
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(markup).toContain("Your completed sorting jobs will appear here.");
    expect(markup).not.toContain(">Open<");
    expect(markup).not.toContain(">Delete<");
  });
});
