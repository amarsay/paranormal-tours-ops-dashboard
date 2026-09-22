"use client";

import { useMemo } from "react";
import { useOps } from "@/lib/store";
import { derivePresence, isSameLondonDay } from "@/lib/freshness";

export function KpiStrip() {
  const { agents, tasks } = useOps();

  const kpis = useMemo(() => {
    let activeNow = 0;
    let needsYou = 0;
    let inFlight = 0;
    let staleOffline = 0;
    let doneToday = 0;

    for (const a of agents) {
      const p = derivePresence(a);
      if (p === "working") activeNow += 1;
      if (p === "blocked" || p === "review" || p === "failed") needsYou += 1;
      if (p === "working" || p === "blocked" || p === "review") inFlight += 1;
      if (p === "stale" || p === "offline") staleOffline += 1;
      if (p === "done") doneToday += 1;
    }

    // Also count tasks marked done today (Europe/London midnight)
    const taskDoneToday = tasks.filter(
      (t) => t.status === "done" && isSameLondonDay(t.updatedAt)
    ).length;
    doneToday = Math.max(doneToday, taskDoneToday);

    return [
      {
        label: "Active now",
        value: activeNow,
        accent: "text-teal-300",
        calm: true,
      },
      {
        label: "Needs you",
        value: needsYou,
        accent: needsYou > 0 ? "text-rose-300" : "text-ink-100",
        calm: needsYou === 0,
        attention: needsYou > 0,
      },
      {
        label: "In flight",
        value: inFlight,
        accent: "text-violet-200",
        calm: true,
      },
      {
        label: "Done today",
        value: doneToday,
        accent: "text-emerald-300",
        calm: true,
      },
      {
        label: "Stale / offline",
        value: staleOffline,
        accent: staleOffline > 0 ? "text-amber-300" : "text-ink-100",
        calm: staleOffline === 0,
        attention: staleOffline > 0,
      },
    ];
  }, [agents, tasks]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {kpis.map((item) => (
        <div
          key={item.label}
          className={`card px-4 py-3 ${
            item.attention ? "border-rose-500/25 bg-rose-950/15" : ""
          }`}
        >
          <p className="text-xs uppercase tracking-wider text-ink-400">
            {item.label}
          </p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${item.accent}`}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
