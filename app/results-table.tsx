"use client";

import { Copy, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DISPLAY_CATEGORIES, type ProviderName, type ProviderResults } from "../lib/types";

const numberFormatter = new Intl.NumberFormat("en-US");

type ResultsTableProps = {
  results: ProviderResults;
  totalCompleted: number;
  onExport: (provider: ProviderName) => void | Promise<void>;
};

type ClipboardWriter = (text: string) => Promise<void>;
type CopyStatus = "idle" | "copied" | "failed";

export function buildClipboardText(emails: string[]): string {
  return emails.join("\n");
}

export async function copyEmailsToClipboard(
  emails: string[],
  writeText?: ClipboardWriter,
): Promise<boolean> {
  if (emails.length === 0) return false;

  const clipboardWriter =
    writeText ??
    (typeof navigator !== "undefined" && navigator.clipboard?.writeText
      ? navigator.clipboard.writeText.bind(navigator.clipboard)
      : undefined);

  if (!clipboardWriter) return false;

  try {
    await clipboardWriter(buildClipboardText(emails));
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ provider, emails }: { provider: ProviderName; emails: string[] }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copyList() {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);

    const copied = await copyEmailsToClipboard(emails);
    setStatus(copied ? "copied" : "failed");
    resetTimer.current = window.setTimeout(() => setStatus("idle"), 1_800);
  }

  const buttonText = status === "copied" ? "Copied!" : status === "failed" ? "Copy failed" : "Copy";
  const ariaLabel =
    status === "copied"
      ? `${provider} list copied`
      : status === "failed"
        ? `Copy ${provider} list failed`
        : `Copy ${provider} list`;

  return (
    <button
      className="export-button copy-button"
      type="button"
      onClick={() => void copyList()}
      aria-label={ariaLabel}
      aria-live="polite"
    >
      <Copy aria-hidden="true" />
      {buttonText}
    </button>
  );
}

export function getVisibleResultCategories(results: ProviderResults): ProviderName[] {
  return DISPLAY_CATEGORIES.filter((provider) => results[provider].length > 0);
}

export function ResultsTable({ results, totalCompleted, onExport }: ResultsTableProps) {
  const visibleProviders = getVisibleResultCategories(results);

  if (visibleProviders.length === 0) {
    return (
      <div className="results-table-wrap results-empty" role="status">
        No provider results to display.
      </div>
    );
  }

  return (
    <div className="results-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Emails</th>
            <th>Share</th>
            <th><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {visibleProviders.map((provider) => {
            const count = results[provider].length;
            const share = totalCompleted ? (count / totalCompleted) * 100 : 0;
            return (
              <tr key={provider}>
                <td>
                  <span className={`provider-dot provider-${provider.toLowerCase().replaceAll(" ", "-").replace(".", "-")}`} aria-hidden="true" />
                  <strong>{provider}</strong>
                </td>
                <td data-label="Emails">{numberFormatter.format(count)}</td>
                <td data-label="Share">{share.toFixed(2)}%</td>
                <td>
                  <div className="result-actions">
                    <button
                      className="export-button"
                      type="button"
                      onClick={() => void onExport(provider)}
                      aria-label={`Export ${provider} list as TXT`}
                    >
                      <Download aria-hidden="true" />
                      Export list
                    </button>
                    <CopyButton provider={provider} emails={results[provider]} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
