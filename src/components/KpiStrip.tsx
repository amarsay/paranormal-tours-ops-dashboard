"use client";

import { useOps } from "@/lib/store";

export function KpiStrip() {
  const { agents, tasks, codex } = useOps();
  const idle = agents.filter((a) => a.status === "idle").length;
  const busy = agents.filter((a) => a.status === "working").length;
  const blocked = agents.filter((a) => a.status === "blocked").length;
  const review = agents.filter((a) => a.status === "review").length;
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const codexQueue = codex.filter(
    (c) => c.status === "submitted" || c.status === "in_review"
  ).length;

  const items = [
    { label: "Agents idle", value: idle, accent: "text-slate-200" },
    { label: "Working", value: busy, accent: "text-teal-300" },
    { label: "Blocked", value: blocked, accent: "text-rose-300" },
    { label: "In review", value: review, accent: "text-violet-300" },
    { label: "Open tasks", value: openTasks, accent: "text-ink-100" },
    { label: "Codex queue", value: codexQueue, accent: "text-teal-200" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="card px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-ink-400">
            {item.label}
          </p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${item.accent}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
