"use client";

import { useOps } from "@/lib/store";

/**
 * Production only: until a real snapshot has loaded in this tab, show an
 * explicit empty/offline state instead of agent views (no demo data on
 * production). Dev / previews and tabs that already have live data render
 * the children as before.
 */
export function LiveDataGate({ children }: { children: React.ReactNode }) {
  const { noLiveData, liveSync, hydrated } = useOps();
  if (!noLiveData) return <>{children}</>;
  const waiting = !hydrated || (liveSync.consecutiveFailures === 0 && !liveSync.error);
  return (
    <div
      className="card flex flex-col items-start gap-2 p-6"
      role="status"
      data-testid="no-live-data"
    >
      <p className="text-xs uppercase tracking-[0.2em] text-amber-300/80">
        {waiting ? "Connecting" : "Offline"}
      </p>
      <h2 className="text-lg font-semibold text-ink-50">
        No live data yet. Waiting for the status store.
      </h2>
      <p className="max-w-2xl text-sm text-ink-300">
        Agent status appears here as soon as the dashboard can read the live
        status store. It retries every few seconds — nothing to do on this
        page.
      </p>
      {liveSync.error ? (
        <p className="text-xs text-ink-400">Last attempt: {liveSync.error}</p>
      ) : null}
    </div>
  );
}
