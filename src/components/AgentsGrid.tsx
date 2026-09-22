"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useOps } from "@/lib/store";
import { SQUADS } from "@/lib/seed";
import type { PresenceStatus } from "@/types";
import { derivePresence, formatUpdatedAgo, isLiveDot } from "@/lib/freshness";
import { AgentStatusChip, LiveDot } from "./StatusChip";

const STATUSES: PresenceStatus[] = ["idle", "working", "blocked", "review", "done", "failed", "stale", "offline"];

export function AgentsGrid() {
  const { agents, hydrated } = useOps();
  const params = useSearchParams();
  const initialSquad = params.get("squad") ?? "all";
  const [query, setQuery] = useState("");
  const [squad, setSquad] = useState(initialSquad);
  const [status, setStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (squad !== "all" && a.squad !== squad) return false;
      if (status !== "all" && derivePresence(a) !== status) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        a.displayName.toLowerCase().includes(q) ||
        (a.currentTask ?? "").toLowerCase().includes(q)
      );
    });
  }, [agents, query, squad, status]);

  if (!hydrated) {
    return <div className="card p-6 text-sm text-ink-400">Loading agents…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agents, roles or tasks…"
          className="input flex-1"
        />
        <select
          value={squad}
          onChange={(e) => setSquad(e.target.value)}
          className="input sm:w-52"
        >
          <option value="all">All squads</option>
          {SQUADS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input sm:w-40"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-ink-400">
        Showing {filtered.length} of {agents.length} agents
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((agent) => (
          <Link
            key={agent.id}
            href={`/agents/${agent.id}`}
            className="card group block p-4 transition hover:border-violet-400/30 hover:shadow-[0_0_28px_rgba(139,92,246,0.12)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-ink-50 group-hover:text-violet-100">
                    {agent.name}
                  </h3>
                  <LiveDot live={isLiveDot(agent)} />
                </div>
                <p className="text-xs text-ink-400">{agent.role}</p>
              </div>
              <AgentStatusChip status={derivePresence(agent)} />
            </div>
            <p className="mt-3 text-xs uppercase tracking-wider text-ink-500">
              {agent.squad}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-ink-300">
              {agent.currentTask ?? "No current task"}
            </p>
            <p className="mt-2 text-xs text-ink-500">
              {formatUpdatedAgo(agent.heartbeatAt || agent.lastUpdate)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
