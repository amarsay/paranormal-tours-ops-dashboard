"use client";

import { formatRelative, useOps } from "@/lib/store";

export function ActivityFeed({ limit = 12 }: { limit?: number }) {
  const { activity, hydrated } = useOps();

  if (!hydrated) {
    return (
      <div className="card p-4 text-sm text-ink-400">Loading activity…</div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink-100">Recent activity</h2>
      </div>
      <ul className="divide-y divide-white/5">
        {activity.slice(0, limit).map((item) => (
          <li key={item.id} className="flex gap-3 px-4 py-3">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400/70 shadow-[0_0_8px_rgba(167,139,250,0.6)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-200">
                {item.agentName && (
                  <span className="font-medium text-violet-200">
                    {item.agentName}{" "}
                  </span>
                )}
                {item.message}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {formatRelative(item.at)}
              </p>
            </div>
          </li>
        ))}
        {activity.length === 0 && (
          <li className="px-4 py-6 text-sm text-ink-400">
            No activity yet — assign a task to get started.
          </li>
        )}
      </ul>
    </div>
  );
}
