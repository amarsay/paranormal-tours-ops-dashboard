"use client";

import { useOps } from "@/lib/store";
import type { CodexStatus } from "@/types";
import { CodexStatusChip } from "./StatusChip";

const COLUMNS: { id: CodexStatus; title: string }[] = [
  { id: "submitted", title: "Submitted" },
  { id: "in_review", title: "In review" },
  { id: "published", title: "Published" },
  { id: "rejected", title: "Rejected" },
];

export function CodexQueue() {
  const { codex, hydrated, updateCodexStatus } = useOps();

  if (!hydrated) {
    return (
      <div className="card p-6 text-sm text-ink-400">Loading Codex queue…</div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">
        Mock validation queue for Codex Ignota entries — conceptually owned by
        Verity (credibility) and Atlas (taxonomy).
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const entries = codex.filter((c) => c.status === col.id);
          return (
            <div key={col.id} className="card flex min-h-[280px] flex-col p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-ink-100">
                  {col.title}
                </h2>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-ink-400">
                  {entries.length}
                </span>
              </div>
              <ul className="flex flex-1 flex-col gap-2">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-xl border border-white/5 bg-ink-900/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink-50">
                        {entry.title}
                      </p>
                      <CodexStatusChip status={entry.status} />
                    </div>
                    <p className="mt-1 text-xs text-ink-400">{entry.place}</p>
                    <p className="mt-2 text-xs text-ink-500">
                      {entry.claimType} · Grade {entry.evidenceGrade} ·{" "}
                      {entry.assignee}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {COLUMNS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={entry.status === c.id}
                          onClick={() => updateCodexStatus(entry.id, c.id)}
                          className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-400 ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-30"
                        >
                          {c.title}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
                {entries.length === 0 && (
                  <li className="px-1 py-6 text-center text-xs text-ink-500">
                    Empty
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
