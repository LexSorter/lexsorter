import type {
  CreateSavedListInput,
  SavedListRecord,
  SavedListSummary,
} from "@/lib/saved-lists/types";

export type Requester = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type SortPersistenceOutcome =
  | { status: "complete"; payload: CreateSavedListInput }
  | { status: "failed" };

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return new Error(body?.error || fallback);
}

export async function persistSortCompletion(
  outcome: SortPersistenceOutcome,
  requester: Requester = fetch,
): Promise<SavedListRecord | null> {
  if (outcome.status !== "complete") return null;

  const response = await requester("/api/saved-lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(outcome.payload),
  });
  if (!response.ok) {
    throw await responseError(response, "The completed list could not be saved");
  }
  const body = (await response.json()) as { list: SavedListRecord };
  return body.list;
}

export async function fetchSavedListSummaries(
  requester: Requester = fetch,
): Promise<SavedListSummary[]> {
  const response = await requester("/api/saved-lists");
  if (!response.ok) {
    throw await responseError(response, "Saved lists could not be loaded");
  }
  const body = (await response.json()) as { lists: SavedListSummary[] };
  return body.lists;
}

export async function fetchSavedList(
  jobId: string,
  requester: Requester = fetch,
): Promise<SavedListRecord> {
  const response = await requester(`/api/saved-lists/${encodeURIComponent(jobId)}`);
  if (!response.ok) {
    throw await responseError(response, "Saved list could not be opened");
  }
  const body = (await response.json()) as { list: SavedListRecord };
  return body.list;
}

export async function deleteSavedList(
  jobId: string,
  requester: Requester = fetch,
): Promise<void> {
  const response = await requester(`/api/saved-lists/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await responseError(response, "Saved list could not be deleted");
  }
}
