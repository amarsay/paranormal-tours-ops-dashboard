"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useOps } from "@/lib/store";
import {
  derivePresence,
  formatLondonClock,
  formatParkedWaiting,
} from "@/lib/freshness";
import { sortBlockers } from "@/lib/parked-blockers";
import { AgentStatusChip } from "./StatusChip";
import { offlineDimClass } from "./offline-dim";

/** Founder job queue: blocked + review only (Needs you). */
export function AttentionStrip() {
  const { agents, hydrated, freshness, offlineDim } = useOps();

  const needsYou = useMemo(() => {
    return agents
      .map((a) => ({ agent: a, presence: derivePresence(a, freshness) }))
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
  }, [agents, freshness]);

  // Every parked blocker across agents, oldest first — separate from the live
  // blocked/review cards above (an agent can be working and still have some).
  const parked = useMemo(() => {
    const all = agents.flatMap((agent) =>
      (agent.parkedBlockers ?? []).map((blocker) => ({ agent, blocker }))
    );
    const order = new Map(
      sortBlockers(all.map((x) => x.blocker)).map((b, i) => [b, i])
    );
    return all.sort(
      (a, b) =>
        (order.get(a.blocker) ?? 0) - (order.get(b.blocker) ?? 0) ||
        a.agent.name.localeCompare(b.agent.name)
    );
  }, [agents]);

  if (!hydrated) return null;

  if (needsYou.length === 0 && parked.length === 0) {
    return (
      <div className="card border-white/5 px-4 py-3">
        <p className="text-sm text-ink-400">
          Nothing needs you right now — waiting for the next heartbeat.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" id="needs-you">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-rose-300/90">
          Needs you
        </h2>
        <p className="text-xs text-ink-500">
          {needsYou.length} item(s)
          {parked.length > 0 && ` · ${parked.length} parked`}
        </p>
      </div>
      {needsYou.length === 0 && (
        <p className="text-sm text-ink-400">No live blocked or review cards.</p>
      )}
      <ul className={`space-y-2 ${offlineDimClass(offlineDim.dimmed)}`}>
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
      {parked.length > 0 && (
        <section
          aria-labelledby="parked-blockers-heading"
          className={`space-y-2 pt-1 ${offlineDimClass(offlineDim.dimmed)}`}
          id="parked-blockers"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3
              id="parked-blockers-heading"
              className="text-xs font-semibold uppercase tracking-wider text-amber-300/90"
            >
              Parked blockers
            </h3>
            <p className="text-xs text-ink-500">oldest first</p>
          </div>
          <ul className="space-y-2">
            {parked.map(({ agent, blocker }) => (
              <li
                key={`${agent.id}:${blocker.id}`}
                className="card flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-amber-500/20 bg-amber-950/10 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <Link
                      href={`/agents/${agent.id}#parked-blockers`}
                      className="font-medium text-ink-50 hover:text-violet-200"
                    >
                      {agent.name}
                    </Link>
                    <span className="break-words text-sm text-amber-100">
                      {blocker.title}
                    </span>
                  </div>
                  {blocker.reason && (
                    <p className="mt-1 break-words text-xs text-ink-300">
                      {blocker.reason}
                    </p>
                  )}
                </div>
                <time
                  dateTime={blocker.since}
                  title={`Parked ${formatLondonClock(Date.parse(blocker.since))} (UK)`}
                  className="shrink-0 text-xs text-amber-200/80"
                >
                  {formatParkedWaiting(blocker.since, freshness)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
