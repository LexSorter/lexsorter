"use client";

import { FolderOpen, Trash2 } from "lucide-react";
import type { SavedListSummary } from "@/lib/saved-lists/types";

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

type SavedListsPanelProps = {
  lists: SavedListSummary[];
  loading: boolean;
  busyJobId: string;
  message: string;
  onOpen: (jobId: string) => void | Promise<void>;
  onDelete: (jobId: string) => void | Promise<void>;
};

export default function SavedListsPanel({
  lists,
  loading,
  busyJobId,
  message,
  onOpen,
  onDelete,
}: SavedListsPanelProps) {
  return (
    <section className="saved-lists-section" aria-labelledby="saved-lists-heading">
      <div className="saved-lists-heading">
        <div>
          <p className="eyebrow">90-DAY HISTORY</p>
          <h2 id="saved-lists-heading">Saved Lists</h2>
        </div>
        <p>Completed sorts expire automatically after 90 days.</p>
      </div>

      {message && <div className="saved-lists-message" role="status">{message}</div>}

      {loading ? (
        <p className="saved-lists-empty" role="status">Loading saved lists…</p>
      ) : lists.length === 0 ? (
        <p className="saved-lists-empty">Your completed sorting jobs will appear here.</p>
      ) : (
        <div className="saved-list-grid">
          {lists.map((list) => {
            const isBusy = busyJobId === list.jobId;
            return (
              <article className="saved-list-card" key={list.jobId}>
                <div>
                  <h3>{list.title}</h3>
                  <strong>{numberFormatter.format(list.normalizedUniqueCount)} emails</strong>
                </div>
                <dl>
                  <div>
                    <dt>Created</dt>
                    <dd>{dateFormatter.format(list.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{dateFormatter.format(list.expiresAt)}</dd>
                  </div>
                </dl>
                <div className="saved-list-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void onOpen(list.jobId)}
                    disabled={isBusy}
                  >
                    <FolderOpen aria-hidden="true" />
                    Open
                  </button>
                  <button
                    className="saved-list-delete"
                    type="button"
                    onClick={() => void onDelete(list.jobId)}
                    disabled={isBusy}
                    aria-label={`Delete ${list.title}`}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
