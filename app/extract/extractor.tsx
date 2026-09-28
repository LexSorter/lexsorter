"use client";

import { useState } from "react";

export default function Extractor() {
  const [query, setQuery] = useState(
    "Find me lawyers in Boston, Massachusetts, United States"
  );
  const [emails, setEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function extract() {
    if (!query.trim()) return;

    setLoading(true);
    setStatus("Searching the public web...");
    setEmails([]);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Extraction failed");
      }

      setEmails((data.leads || []).map((lead: { email: string }) => lead.email));
      setStatus(`${data.emailsFound || 0} emails found`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  }

  async function copyEmails() {
    await navigator.clipboard.writeText(emails.join("\n"));
    setStatus(`${emails.length} emails copied`);
  }

  function downloadCsv() {
    const csv =
      "Email\n" +
      emails
        .map((email) => `"${email.replace(/"/g, '""')}"`)
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "lexsorter-emails.csv";
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-white px-6 py-12 text-zinc-950">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10">
          <h1 className="text-4xl font-semibold tracking-tight">
            Extract Emails
          </h1>
          <p className="mt-2 text-zinc-500">
            Find publicly available professional email addresses from the web.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <div className="flex gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") extract();
              }}
              className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-zinc-900"
              placeholder="Find me lawyers in Boston, Massachusetts, United States"
            />

            <button
              onClick={extract}
              disabled={loading}
              className="rounded-xl bg-zinc-950 px-6 py-3 font-medium text-white disabled:opacity-50"
            >
              {loading ? "Extracting..." : "Extract Emails"}
            </button>
          </div>

          {status && (
            <div className="mt-3 text-sm text-zinc-500">{status}</div>
          )}
        </div>

        {emails.length > 0 && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-5 py-4">
              <div>
                <div className="font-semibold">{emails.length} Emails</div>
                <div className="text-sm text-zinc-500">
                  Publicly discovered addresses
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={copyEmails}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium"
                >
                  Copy Emails
                </button>

                <button
                  onClick={downloadCsv}
                  className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
                >
                  Export CSV
                </button>
              </div>
            </div>

            <div className="divide-y divide-zinc-100">
              {emails.map((email) => (
                <div
                  key={email}
                  className="px-5 py-3 font-mono text-sm"
                >
                  {email}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
