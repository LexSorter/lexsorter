"use client";

import Image from "next/image";
import readXlsxFile from "read-excel-file/browser";
import {
  Check,
  FileSpreadsheet,
  FileText,
  Globe2,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import logo from "@/logo.png";
import { ResultsTable } from "./results-table";
import SavedListsPanel from "./saved-lists-panel";
import {
  deleteSavedList,
  fetchSavedList,
  fetchSavedListSummaries,
  persistSortCompletion,
  type Requester,
} from "./saved-lists-client";
import {
  extractEmailCandidates,
  getEmailDomain,
  isValidEmail,
  prepareEmails,
} from "@/lib/email";
import { buildTextExport, cleanExportFilename } from "@/lib/export";
import {
  DISPLAY_CATEGORIES,
  type DomainClassification,
  type ProviderName,
  type ProviderResults,
  type ResolveResponse,
} from "@/lib/types";
import type { SavedListSummary } from "@/lib/saved-lists/types";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const BATCH_SIZE = 200;
const CLIENT_CONCURRENCY = 3;
const numberFormatter = new Intl.NumberFormat("en-US");

type AppPhase = "idle" | "ready" | "sorting" | "complete";

type ProgressState = {
  domainsProcessed: number;
  totalDomains: number;
  emailsProcessed: number;
  totalEmails: number;
};

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

function emptyResults(): ProviderResults {
  const initial = {} as ProviderResults;
  for (const category of DISPLAY_CATEGORIES) initial[category] = [];
  return initial;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchDomainBatch(domains: string[], attempt = 0): Promise<DomainClassification[]> {
  try {
    const response = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domains }),
    });

    if (response.status === 401) {
      window.location.replace("/unlock");
      throw new Error("Your access session has expired. Unlock Lex Sorter again.");
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || "The DNS service could not process this batch.");
    }

    const data = (await response.json()) as ResolveResponse;
    return data.results;
  } catch (error) {
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      return fetchDomainBatch(domains, 1);
    }
    throw error;
  }
}

export default function Sorter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileCandidates, setFileCandidates] = useState<string[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ProviderResults>(() => emptyResults());
  const [completedDuplicates, setCompletedDuplicates] = useState(0);
  const [completedDomainCount, setCompletedDomainCount] = useState(0);
  const [savedLists, setSavedLists] = useState<SavedListSummary[]>([]);
  const [savedListsLoading, setSavedListsLoading] = useState(true);
  const [savedListsMessage, setSavedListsMessage] = useState("");
  const [savedListsBusyJobId, setSavedListsBusyJobId] = useState("");
  const [progress, setProgress] = useState<ProgressState>({
    domainsProcessed: 0,
    totalDomains: 0,
    emailsProcessed: 0,
    totalEmails: 0,
  });

  const prepared = useMemo(() => {
    const pastedCandidates = extractEmailCandidates(pastedText);
    return prepareEmails([...fileCandidates, ...pastedCandidates]);
  }, [fileCandidates, pastedText]);

  const loadedCount = prepared.emails.length;
  const progressPercent = progress.totalEmails
    ? Math.min(100, Math.round((progress.emailsProcessed / progress.totalEmails) * 100))
    : 0;

  const authenticatedRequest = useCallback<Requester>(async (input, init) => {
    const response = await fetch(input, init);
    if (response.status === 401) {
      window.location.replace("/unlock");
    }
    return response;
  }, []);

  const loadSavedLists = useCallback(async () => {
    try {
      const lists = await fetchSavedListSummaries(authenticatedRequest);
      setSavedLists(lists);
    } catch {
      setSavedListsMessage("Saved lists could not be loaded. You can still sort emails.");
    } finally {
      setSavedListsLoading(false);
    }
  }, [authenticatedRequest]);

  useEffect(() => {
    void loadSavedLists();
  }, [loadSavedLists]);

  function markInputChanged() {
    setError("");
    setResults(emptyResults());
    setCompletedDuplicates(0);
    setCompletedDomainCount(0);
    setProgress({ domainsProcessed: 0, totalDomains: 0, emailsProcessed: 0, totalEmails: 0 });
    setPhase("idle");
  }

  async function readFile(file: File) {
    markInputChanged();
    setFileBusy(true);

    try {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("Please choose a file smaller than 25 MB.");
      }

      const extension = file.name.split(".").pop()?.toLowerCase();
      let candidates: string[] = [];

      if (extension === "xlsx") {
        const sheets = await readXlsxFile(file);
        for (const sheet of sheets) {
          for (const row of sheet.data) {
            for (const cell of row) {
              if (cell !== null && cell !== undefined) {
                candidates.push(...extractEmailCandidates(String(cell)));
              }
            }
          }
        }
      } else if (extension === "txt" || extension === "csv") {
        candidates = extractEmailCandidates(await file.text());
      } else {
        throw new Error("Unsupported file type. Choose a TXT, CSV, or XLSX file.");
      }

      setFileCandidates(candidates);
      setSelectedFileName(file.name);
      setPhase(candidates.length > 0 || pastedText ? "ready" : "idle");
      if (candidates.length === 0) {
        setError("No email addresses were found in that file.");
      }
    } catch (fileError) {
      setFileCandidates([]);
      setSelectedFileName("");
      setError(fileError instanceof Error ? fileError.message : "The file could not be read.");
    } finally {
      setFileBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (phase === "sorting") return;
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  }

  function clearFile() {
    markInputChanged();
    setFileCandidates([]);
    setSelectedFileName("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handlePasteChange(value: string) {
    markInputChanged();
    setPastedText(value);
    if (value || fileCandidates.length) setPhase("ready");
  }

  async function startSorting() {
    if (prepared.emails.length === 0 || phase === "sorting") return;

    setError("");
    setSavedListsMessage("");
    setPhase("sorting");
    const snapshot = [...prepared.emails];
    const duplicatesRemoved = prepared.duplicatesRemoved;
    const nextResults = emptyResults();
    const validEmails: string[] = [];

    for (const email of snapshot) {
      if (isValidEmail(email)) validEmails.push(email);
      else nextResults.Dead.push(email);
    }

    const emailsByDomain = new Map<string, string[]>();
    for (const email of validEmails) {
      const domain = getEmailDomain(email);
      const domainEmails = emailsByDomain.get(domain) ?? [];
      domainEmails.push(email);
      emailsByDomain.set(domain, domainEmails);
    }

    const domains = [...emailsByDomain.keys()];
    const domainBatches = chunk(domains, BATCH_SIZE);
    const jobCache = new Map<string, DomainClassification>();
    let batchCursor = 0;
    let domainsProcessed = 0;
    let emailsProcessed = nextResults.Dead.length;

    setProgress({
      domainsProcessed: 0,
      totalDomains: domains.length,
      emailsProcessed,
      totalEmails: snapshot.length,
    });

    try {
      async function worker() {
        while (batchCursor < domainBatches.length) {
          const currentBatch = domainBatches[batchCursor++];
          const uncachedDomains = currentBatch.filter((domain) => !jobCache.has(domain));
          const classifications = await fetchDomainBatch(uncachedDomains);

          for (const classification of classifications) {
            jobCache.set(classification.domain, classification);
          }

          for (const domain of currentBatch) {
            const classification = jobCache.get(domain);
            const emailCount = emailsByDomain.get(domain)?.length ?? 0;
            if (!classification) {
              jobCache.set(domain, {
                domain,
                provider: "Dead",
                mx: [],
                status: "dead",
                reason: "Domain could not be classified",
              });
            }
            domainsProcessed += 1;
            emailsProcessed += emailCount;
          }

          setProgress({
            domainsProcessed,
            totalDomains: domains.length,
            emailsProcessed,
            totalEmails: snapshot.length,
          });
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CLIENT_CONCURRENCY, domainBatches.length) }, worker),
      );

      for (const email of validEmails) {
        const classification = jobCache.get(getEmailDomain(email));
        const provider = classification?.provider ?? "Dead";
        nextResults[provider].push(email);
      }

      for (const category of DISPLAY_CATEGORIES) {
        nextResults[category].sort((a, b) => a.localeCompare(b));
      }

      setResults(nextResults);
      setCompletedDuplicates(duplicatesRemoved);
      setCompletedDomainCount(domains.length);
      setProgress({
        domainsProcessed: domains.length,
        totalDomains: domains.length,
        emailsProcessed: snapshot.length,
        totalEmails: snapshot.length,
      });
      setPhase("complete");

      try {
        await persistSortCompletion(
          {
            status: "complete",
            payload: {
              sourceName: selectedFileName || undefined,
              originalInputCount: snapshot.length + duplicatesRemoved,
              normalizedUniqueCount: snapshot.length,
              duplicatesRemoved,
              domainCount: domains.length,
              results: nextResults,
            },
          },
          authenticatedRequest,
        );
        setSavedListsMessage("Completed list saved for 90 days.");
        await loadSavedLists();
      } catch {
        setSavedListsMessage(
          "Your results are ready, but this list could not be saved. Copy and Export still work.",
        );
      }
    } catch (sortingError) {
      setError(
        sortingError instanceof Error
          ? sortingError.message
          : "Sorting stopped because the DNS service was unavailable.",
      );
      setPhase("ready");
    }
  }

  async function openSavedList(jobId: string) {
    setSavedListsBusyJobId(jobId);
    setSavedListsMessage("");
    try {
      const savedList = await fetchSavedList(jobId, authenticatedRequest);
      setResults(savedList.results);
      setCompletedDuplicates(savedList.duplicatesRemoved);
      setCompletedDomainCount(savedList.domainCount);
      setProgress({
        domainsProcessed: savedList.domainCount,
        totalDomains: savedList.domainCount,
        emailsProcessed: savedList.normalizedUniqueCount,
        totalEmails: savedList.normalizedUniqueCount,
      });
      setPhase("complete");
      setError("");
      setSavedListsMessage(`Opened ${savedList.title}.`);
    } catch {
      setSavedListsMessage("That saved list is unavailable or has expired.");
      await loadSavedLists();
    } finally {
      setSavedListsBusyJobId("");
    }
  }

  async function removeSavedList(jobId: string) {
    const list = savedLists.find((candidate) => candidate.jobId === jobId);
    if (!list || !window.confirm(`Delete “${list.title}”?`)) return;

    setSavedListsBusyJobId(jobId);
    setSavedListsMessage("");
    try {
      await deleteSavedList(jobId, authenticatedRequest);
      setSavedLists((current) => current.filter((candidate) => candidate.jobId !== jobId));
      setSavedListsMessage("Saved list deleted.");
    } catch {
      setSavedListsMessage("That saved list could not be deleted.");
    } finally {
      setSavedListsBusyJobId("");
    }
  }

  function resetAll() {
    setFileCandidates([]);
    setPastedText("");
    setSelectedFileName("");
    markInputChanged();
  }

  async function exportList(provider: ProviderName) {
    const emails = results[provider];
    if (emails.length === 0) return;

    const suggestedBase = `Lex Sorter ${provider}`;
    const contents = buildTextExport(emails);
    const pickerWindow = window as SaveFilePickerWindow;

    if (pickerWindow.showSaveFilePicker) {
      try {
        const handle = await pickerWindow.showSaveFilePicker({
          suggestedName: `${suggestedBase}.txt`,
          types: [
            {
              description: "Text file",
              accept: { "text/plain": [".txt"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(new Blob([contents], { type: "text/plain;charset=utf-8" }));
        await writable.close();
        return;
      } catch (saveError) {
        if (saveError instanceof DOMException && saveError.name === "AbortError") return;
      }
    }

    const requestedName = window.prompt("Name this export", suggestedBase);
    if (requestedName === null) return;
    const filename = cleanExportFilename(requestedName);
    const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  const deadCount = results.Dead.length;
  const totalCompleted = DISPLAY_CATEGORIES.reduce(
    (total, category) => total + results[category].length,
    0,
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          <Image src={logo} alt="Lex Sorter" priority sizes="220px" />
        </div>
        <div className="topbar-actions">
          <div className="method-note">
            <ShieldCheck aria-hidden="true" />
            <span>MX-based sorting. No mailbox verification.</span>
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="lock-button" type="submit">Lock</button>
          </form>
        </div>
      </header>

      <section className="workspace" aria-labelledby="page-title">
        <div className="intro-row">
          <div>
            <p className="eyebrow">MAIL PROVIDER SORTER</p>
            <h1 id="page-title">Sort your email list by provider.</h1>
          </div>
          {phase === "complete" && (
            <button className="text-button" type="button" onClick={resetAll}>
              <RotateCcw aria-hidden="true" />
              Start over
            </button>
          )}
        </div>

        <div className="input-grid">
          <section className="input-panel" aria-labelledby="upload-heading">
            <div className="section-heading">
              <span className="step-number">01</span>
              <div>
                <h2 id="upload-heading">Upload email list</h2>
                <p>We scan every cell and column.</p>
              </div>
            </div>

            <input
              ref={inputRef}
              hidden
              type="file"
              accept=".txt,.csv,.xlsx,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFileInput}
              disabled={phase === "sorting" || fileBusy}
            />

            <div
              className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                if (phase !== "sorting") setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              <div className="upload-icon" aria-hidden="true">
                {fileBusy ? <LoaderCircle className="spin" /> : <Upload />}
              </div>
              <div>
                <p className="drop-title">{fileBusy ? "Reading file…" : "Drop a file here"}</p>
                <p className="drop-copy">or choose one from your computer</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={phase === "sorting" || fileBusy}
              >
                Choose file
              </button>
              <div className="file-types" aria-label="Supported file types">
                <span><FileText aria-hidden="true" />TXT</span>
                <span><FileSpreadsheet aria-hidden="true" />CSV</span>
                <span><FileSpreadsheet aria-hidden="true" />XLSX</span>
              </div>
            </div>

            {selectedFileName && (
              <div className="selected-file">
                <span><Check aria-hidden="true" />{selectedFileName}</span>
                <button type="button" onClick={clearFile} aria-label={`Remove ${selectedFileName}`} disabled={phase === "sorting"}>
                  <X aria-hidden="true" />
                </button>
              </div>
            )}
          </section>

          <div className="or-divider" aria-hidden="true"><span>OR</span></div>

          <section className="input-panel" aria-labelledby="paste-heading">
            <div className="section-heading">
              <span className="step-number">02</span>
              <div>
                <h2 id="paste-heading">Paste email addresses</h2>
                <p>Use commas, spaces, or one address per line.</p>
              </div>
            </div>
            <label className="sr-only" htmlFor="email-paste">Email addresses</label>
            <textarea
              id="email-paste"
              value={pastedText}
              onChange={(event) => handlePasteChange(event.target.value)}
              placeholder={"alex@example.com\njordan@company.org\nsam@gmail.com"}
              spellCheck={false}
              disabled={phase === "sorting"}
            />
          </section>
        </div>

        {error && <div className="error-banner" role="alert">{error}</div>}

        <section className="run-panel" aria-live="polite">
          <div className="loaded-count">
            <span>Emails loaded</span>
            <strong>{numberFormatter.format(loadedCount)}</strong>
            {prepared.duplicatesRemoved > 0 && (
              <small>{numberFormatter.format(prepared.duplicatesRemoved)} duplicate{prepared.duplicatesRemoved === 1 ? "" : "s"} ready to remove</small>
            )}
          </div>

          {phase === "sorting" ? (
            <div className="progress-block">
              <div className="progress-heading">
                <span><LoaderCircle className="spin" aria-hidden="true" />Sorting…</span>
                <strong>{progressPercent}%</strong>
              </div>
              <div className="progress-track" aria-label={`Sorting progress: ${progressPercent}%`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="progress-meta">
                <span>{numberFormatter.format(progress.emailsProcessed)} / {numberFormatter.format(progress.totalEmails)} emails</span>
                <span>{numberFormatter.format(progress.domainsProcessed)} / {numberFormatter.format(progress.totalDomains)} domains</span>
              </div>
            </div>
          ) : (
            <button
              className="primary-button"
              type="button"
              onClick={() => void startSorting()}
              disabled={loadedCount === 0 || fileBusy}
            >
              <Play aria-hidden="true" fill="currentColor" />
              Start sorting
            </button>
          )}
        </section>
      </section>

      <SavedListsPanel
        lists={savedLists}
        loading={savedListsLoading}
        busyJobId={savedListsBusyJobId}
        message={savedListsMessage}
        onOpen={openSavedList}
        onDelete={removeSavedList}
      />

      {phase === "complete" && (
        <section className="results-section" aria-labelledby="results-heading">
          <div className="complete-heading">
            <div className="complete-icon"><Check aria-hidden="true" /></div>
            <div>
              <p className="eyebrow">SORTING COMPLETE</p>
              <h2 id="results-heading">Your lists are ready.</h2>
            </div>
          </div>

          <div className="summary-grid">
            <article><span>Total emails</span><strong>{numberFormatter.format(totalCompleted)}</strong></article>
            <article><span>Processed</span><strong>{numberFormatter.format(totalCompleted)}</strong></article>
            <article><span>Duplicates removed</span><strong>{numberFormatter.format(completedDuplicates)}</strong></article>
            <article><span>Domains checked</span><strong>{numberFormatter.format(completedDomainCount)}</strong></article>
            <article className="dead-stat"><span>Dead</span><strong>{numberFormatter.format(deadCount)}</strong></article>
          </div>

          <ResultsTable
            results={results}
            totalCompleted={totalCompleted}
            onExport={exportList}
          />
        </section>
      )}

      <footer>
        <span><Globe2 aria-hidden="true" />DNS and MX records only</span>
        <span>Completed lists are securely saved for 90 days.</span>
      </footer>
    </main>
  );
}
