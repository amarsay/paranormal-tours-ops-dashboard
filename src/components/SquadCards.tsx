"use client";

import Link from "next/link";
import { useOps } from "@/lib/store";
import { SQUADS } from "@/lib/seed";
import { AgentStatusChip } from "./StatusChip";

export function SquadCards() {
  const { agents } = useOps();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {SQUADS.map((squad) => {
        const members = agents.filter((a) => a.squad === squad);
        const working = members.filter((a) => a.status === "working").length;
        return (
          <div key={squad} className="card p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-ink-50">{squad}</h3>
                <p className="text-xs text-ink-400">
                  {members.length} agents · {working} working
                </p>
              </div>
              <Link
                href={`/agents?squad=${encodeURIComponent(squad)}`}
                className="text-xs text-teal-300 hover:text-teal-200"
              >
                View squad →
              </Link>
            </div>
            <ul className="space-y-2">
              {members.slice(0, 5).map((agent) => (
                <li
                  key={agent.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-2.5 py-2"
                >
                  <Link
                    href={`/agents/${agent.id}`}
                    className="truncate text-sm text-ink-100 hover:text-violet-200"
                  >
                    {agent.name}
                    <span className="ml-2 text-xs text-ink-500">
                      {agent.role}
                    </span>
                  </Link>
                  <AgentStatusChip status={agent.status} />
                </li>
              ))}
              {members.length > 5 && (
                <li className="px-2 text-xs text-ink-500">
                  +{members.length - 5} more
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
