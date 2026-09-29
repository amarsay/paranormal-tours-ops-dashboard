"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { Agent, ParkedBlocker } from "@/types";
import type { FreshnessRef } from "@/lib/freshness";
import { formatLondonClock, formatParkedWaiting } from "@/lib/freshness";

export function parkedLabel(n: number): string {
  return `${n} parked blocker${n === 1 ? "" : "s"}`;
}

/** Title · reason · waiting time (snapshot clock). */
export function ParkedBlockerList({
  blockers,
  freshness,
  className = "",
}: {
  blockers: ParkedBlocker[];
  freshness: FreshnessRef;
  className?: string;
}) {
  return (
    <ul className={`min-w-0 space-y-2 ${className}`}>
      {blockers.map((b) => (
        <li
          key={b.id}
          className="min-w-0 rounded-lg bg-amber-500/[0.06] px-3 py-2 ring-1 ring-amber-400/15"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <p className="min-w-0 max-w-full text-sm font-medium text-amber-100 [overflow-wrap:anywhere]">
              {b.title}
            </p>
            <time
              dateTime={b.since}
              title={`Parked ${formatLondonClock(Date.parse(b.since))} (UK)`}
              className="shrink-0 text-xs text-amber-200/70"
            >
              {formatParkedWaiting(b.since, freshness)}
            </time>
          </div>
          {b.reason && (
            <p className="mt-0.5 min-w-0 text-xs text-ink-300 [overflow-wrap:anywhere]">
              {b.reason}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Small amber chip "N parked blocker(s)" that discloses the list inline.
 * Native <button> with aria-expanded/aria-controls (Enter/Space toggle);
 * Escape closes and returns focus to the chip. Renders nothing when none.
 */
export function ParkedBlockersChip({
  agent,
  freshness,
  defaultOpen = false,
}: {
  agent: Agent;
  freshness: FreshnessRef;
  defaultOpen?: boolean;
}) {
  const blockers = agent.parkedBlockers ?? [];
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  if (blockers.length === 0) return null;

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  return (
    <div
      className="mt-3 min-w-0"
      onKeyDown={onKeyDown}
      data-parked-chip={agent.id}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-200 ring-1 ring-amber-400/40 transition hover:bg-amber-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-300" />
        {parkedLabel(blockers.length)}
        <span aria-hidden="true" className={`transition ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-label={`${agent.name} — ${parkedLabel(blockers.length)}`}
        hidden={!open}
        className="mt-2"
      >
        <ParkedBlockerList blockers={blockers} freshness={freshness} />
      </div>
    </div>
  );
}
