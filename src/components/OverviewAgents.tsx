"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useOps } from "@/lib/store";
import {
  derivePresence,
  formatUpdatedAgo,
  isLiveDot,
} from "@/lib/freshness";
import { AgentStatusChip, LiveDot } from "./StatusChip";

/** Compact agent cards for Overview — relative time, presence, live dot. */
export function OverviewAgents() {
  const { agents, hydrated } = useOps();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const sorted = useMemo(() => {
    const rank = (p: string) => {
      // Flo: blocked band (failed/blocked/stale) → review → working → idle
      if (p === "failed" || p === "blocked" || p === "stale") return 0;
      if (p === "review") return 1;
      if (p === "working") return 2;
      if (p === "done") return 3;
      if (p === "offline") return 4;
      return 5;
    };
    return [...agents]
      .map((a) => ({ agent: a, presence: derivePresence(a) }))
      .sort((a, b) => {
        const d = rank(a.presence) - rank(b.presence);
        if (d !== 0) return d;
        return a.agent.name.localeCompare(b.agent.name);
      });
  }, [agents]);

  if (!hydrated) {
    return (
      <div className="card p-4 text-sm text-ink-400">Loading agents…</div>
    );
  }

  const anyLive = agents.some((a) => a.live);
  if (!anyLive && agents.every((a) => !a.heartbeatAt && !a.lastUpdate)) {
    /* seed has lastUpdate sometimes — check live overlay empty */
  }

  const waiting =
    !agents.some((a) => a.live) &&
    !agents.some((a) => a.heartbeatAt);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-400">
          Agents
        </h2>
        {waiting && (
          <p className="text-xs text-ink-500">Waiting for first heartbeat</p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map(({ agent, presence }) => {
          const live = isLiveDot(agent);
          const attention =
            presence === "blocked" ||
            presence === "review" ||
            presence === "failed" ||
            presence === "stale";
          return (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              id={`overview-agent-${agent.id}`}
              className={`card group block p-4 transition hover:border-violet-400/30 ${
                attention ? "border-rose-500/20" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-ink-50 group-hover:text-violet-100">
                      {agent.name}
                    </h3>
                    <LiveDot live={live} />
                  </div>
                  <p className="text-xs text-ink-400">{agent.role}</p>
                </div>
                <AgentStatusChip status={presence} />
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-ink-300">
                {agent.currentTask ?? "No current task"}
              </p>
              {agent.blockerReason && (
                <p className="mt-1 line-clamp-1 text-xs text-rose-300/80">
                  {agent.blockerReason}
                </p>
              )}
              <p className="mt-2 text-xs text-ink-500">
                {formatUpdatedAgo(agent.heartbeatAt || agent.lastUpdate)}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
