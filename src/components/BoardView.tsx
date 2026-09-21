"use client";

import Link from "next/link";
import { useOps } from "@/lib/store";
import type { TaskStatus } from "@/types";

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: "backlog", title: "Backlog" },
  { id: "in_progress", title: "In progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
];

export function BoardView() {
  const { tasks, hydrated, updateTaskStatus } = useOps();

  if (!hydrated) {
    return <div className="card p-6 text-sm text-ink-400">Loading board…</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const cards = tasks.filter((t) => t.status === col.id);
        return (
          <div key={col.id} className="card flex min-h-[320px] flex-col p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-ink-100">{col.title}</h2>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-ink-400">
                {cards.length}
              </span>
            </div>
            <ul className="flex flex-1 flex-col gap-2">
              {cards.map((task) => (
                <li
                  key={task.id}
                  className="rounded-xl border border-white/5 bg-ink-900/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <p className="text-sm font-medium text-ink-50">{task.title}</p>
                  <Link
                    href={`/agents/${task.agentId}`}
                    className="mt-1 inline-block text-xs text-teal-300 hover:text-teal-200"
                  >
                    {task.agentName}
                  </Link>
                  {task.notes && (
                    <p className="mt-2 line-clamp-2 text-xs text-ink-400">
                      {task.notes}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {COLUMNS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={task.status === c.id}
                        onClick={() => updateTaskStatus(task.id, c.id)}
                        className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-400 ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-30"
                      >
                        {c.title}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
              {cards.length === 0 && (
                <li className="px-1 py-6 text-center text-xs text-ink-500">
                  No cards
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
