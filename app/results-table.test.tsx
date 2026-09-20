import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResultsTable, getVisibleResultCategories } from "./results-table";
import { DISPLAY_CATEGORIES, type ProviderResults } from "../lib/types";

function resultsWith(overrides: Partial<ProviderResults> = {}): ProviderResults {
  const results = {} as ProviderResults;
  for (const provider of DISPLAY_CATEGORIES) results[provider] = [];
  return Object.assign(results, overrides);
}

function findElements(node: ReactNode, type: string): ReactElement[] {
  const matches: ReactElement[] = [];

  function visit(current: ReactNode) {
    if (!isValidElement(current)) return;
    if (current.type === type) matches.push(current);
    Children.forEach((current.props as { children?: ReactNode }).children, visit);
  }

  visit(node);
  return matches;
}

describe("ResultsTable", () => {
  it("does not render a zero-count category or its export button", () => {
    const markup = renderToStaticMarkup(
      <ResultsTable results={resultsWith({ Gmail: [] })} totalCompleted={0} onExport={() => {}} />,
    );

    expect(markup).not.toContain("Gmail");
    expect(markup).not.toContain("Export Gmail list as TXT");
  });

  it("renders a category with one email normally", () => {
    const markup = renderToStaticMarkup(
      <ResultsTable
        results={resultsWith({ Gmail: ["one@gmail.com"] })}
        totalCompleted={1}
        onExport={() => {}}
      />,
    );

    expect(markup).toContain("Gmail");
    expect(markup).toContain("100.00%");
    expect(markup).toContain("Export Gmail list as TXT");
  });

  it("hides multiple zero-count categories while retaining populated categories", () => {
    const markup = renderToStaticMarkup(
      <ResultsTable
        results={resultsWith({
          Gmail: ["one@gmail.com", "two@gmail.com"],
          GSuite: ["person@company.example"],
          "Office 365": [],
          Microsoft: [],
          iCloud: [],
          Webmails: [],
        })}
        totalCompleted={3}
        onExport={() => {}}
      />,
    );

    expect(markup).toContain("Gmail");
    expect(markup).toContain("GSuite");
    expect(markup).not.toContain("Office 365");
    expect(markup).not.toContain("Microsoft");
    expect(markup).not.toContain("iCloud");
    expect(markup).not.toContain("Webmails");
  });

  it("keeps the export action wired for a populated category", () => {
    const onExport = vi.fn();
    const tree = ResultsTable({
      results: resultsWith({ Gmail: ["one@gmail.com"] }),
      totalCompleted: 1,
      onExport,
    });
    const [button] = findElements(tree, "button");

    expect(button).toBeDefined();
    (button.props as { onClick: () => void }).onClick();
    expect(onExport).toHaveBeenCalledOnce();
    expect(onExport).toHaveBeenCalledWith("Gmail");
  });

  it("renders an empty-results state instead of an all-zero table", () => {
    const results = resultsWith();
    const markup = renderToStaticMarkup(
      <ResultsTable results={results} totalCompleted={0} onExport={() => {}} />,
    );

    expect(getVisibleResultCategories(results)).toEqual([]);
    expect(markup).toContain("No provider results to display.");
    expect(markup).not.toContain("<table");
    expect(markup).not.toContain("Export list");
  });
});
