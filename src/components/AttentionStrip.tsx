"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useOps } from "@/lib/store";
import { derivePresence } from "@/lib/freshness";
import { AgentStatusChip } from "./StatusChip";

/** Founder job queue: blocked + review only (Needs you). */
export function AttentionStrip() {
  const { agents, hydrated } = useOps();

  const needsYou = useMemo(() => {
    return agents
      .map((a) => ({ agent: a, presence: derivePresence(a) }))
      .filter(
        ({ presence }) =>
          presence === "blocked" ||
          presence === "review" ||
          presence === "failed"
      )
      .sort((a, b) => {
        const rank = (p: string) =>
          p === "failed" ? 0 : p === "blocked" ? 1 : 2;
        return rank(a.presence) - rank(b.presence);
      });
  }, [agents]);

  if (!hydrated) return null;

  if (needsYou.length === 0) {
    return (
      <div className="card border-white/5 px-4 py-3">
        <p className="text-sm text-ink-400">
          Nothing needs you right now — waiting for the next heartbeat.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-rose-300/90">
          Needs you
        </h2>
        <p className="text-xs text-ink-500">{needsYou.length} item(s)</p>
      </div>
      <ul className="space-y-2">
        {needsYou.map(({ agent, presence }) => {
          const isReview = presence === "review";
          const cta = isReview ? "Review" : "Unblock";
          return (
            <li
              key={agent.id}
              id={`agent-card-${agent.id}`}
              className="card flex flex-wrap items-center justify-between gap-3 border-rose-500/20 bg-rose-950/20 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/agents/${agent.id}`}
                    className="font-medium text-ink-50 hover:text-violet-200"
                  >
                    {agent.name}
                  </Link>
                  <AgentStatusChip status={presence} />
                </div>
                <p className="mt-1 truncate text-sm text-ink-300">
                  {agent.currentTask ?? "No task title"}
                </p>
                {agent.blockerReason && (
                  <p className="mt-1 text-xs text-rose-200/80">
                    {agent.blockerReason}
                  </p>
                )}
              </div>
              <Link
                href={`/agents/${agent.id}`}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium ring-1 transition ${
                  isReview
                    ? "bg-violet-500/20 text-violet-100 ring-violet-400/40 hover:bg-violet-500/30"
                    : "bg-rose-500/20 text-rose-100 ring-rose-400/40 hover:bg-rose-500/30"
                }`}
              >
                {cta}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
