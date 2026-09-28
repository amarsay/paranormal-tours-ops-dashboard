"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatSyncedAgo } from "@/lib/live-sync";
import { useOps } from "@/lib/store";
import type { LiveSyncMode } from "@/types";

const links = [
  { href: "/", label: "Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/board", label: "Board" },
  { href: "/codex", label: "Codex" },
];

/**
 * Display-only 1s tick for "Last synced Ns ago" (doesn't affect staleness).
 * Consumers read Math.max(now, Date.now()) so text is never a tick behind a
 * state change such as dimming.
 */
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const MODE_VIEW: Record<
  LiveSyncMode,
  { label: string; short: string; pill: string; dot: string }
> = {
  live: {
    label: "Live · 5s",
    short: "Live",
    pill: "text-teal-200 ring-teal-400/30 bg-teal-500/10",
    dot: "bg-teal-400 motion-safe:animate-pulse",
  },
  polling: {
    label: "Polling…",
    short: "Syncing",
    pill: "text-violet-200 ring-violet-400/30 bg-violet-500/10",
    dot: "bg-violet-300/60",
  },
  reconnecting: {
    label: "Reconnecting…",
    short: "Reconnecting",
    pill: "text-violet-200 ring-violet-400/30 bg-violet-500/10",
    dot: "bg-violet-400",
  },
  offline: {
    label: "Offline",
    short: "Offline",
    pill: "text-amber-200 ring-amber-400/30 bg-amber-500/10",
    dot: "bg-amber-400",
  },
  idle: {
    label: "Live sync off",
    short: "Sync off",
    pill: "text-ink-500 ring-white/10",
    dot: "bg-ink-500",
  },
};

function syncTitle(
  liveSync: ReturnType<typeof useOps>["liveSync"],
  synced: string
): string {
  return [
    synced,
    liveSync?.error
      ? `${liveSync.error}${
          liveSync.consecutiveFailures
            ? ` (${liveSync.consecutiveFailures} failed poll${
                liveSync.consecutiveFailures === 1 ? "" : "s"
              })`
            : ""
        }`
      : null,
    liveSync?.storage ? `storage: ${liveSync.storage}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Desktop pill (sm and up). */
function LiveIndicator({ now }: { now: number }) {
  const { liveSync } = useOps();
  const view = MODE_VIEW[liveSync?.mode ?? "idle"];
  const synced = formatSyncedAgo(
    liveSync?.receivedAt ?? null,
    Math.max(now, Date.now())
  );

  return (
    <span
      id="live-indicator"
      className={`hidden items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 sm:inline-flex ${view.pill}`}
      title={syncTitle(liveSync, synced)}
    >
      {liveSync?.mode !== "idle" && liveSync?.mode !== "polling" && (
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${view.dot}`} />
      )}
      {view.label}
      {liveSync?.receivedAt != null && (
        <span
          id="live-last-synced"
          className="font-normal tabular-nums opacity-80"
        >
          · {synced}
        </span>
      )}
    </span>
  );
}

/** Compact phone indicator (below sm): coloured dot + one-word state. */
function MobileLiveDot({ now }: { now: number }) {
  const { liveSync } = useOps();
  const view = MODE_VIEW[liveSync?.mode ?? "idle"];
  const synced = formatSyncedAgo(
    liveSync?.receivedAt ?? null,
    Math.max(now, Date.now())
  );

  return (
    <span
      id="live-indicator-mobile"
      role="status"
      aria-label={`Live sync: ${view.short}. ${synced}`}
      title={syncTitle(liveSync, synced)}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 sm:hidden ${view.pill}`}
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${view.dot}`} />
      {view.short}
    </span>
  );
}

/**
 * Thin banner under the header:
 * - phones: Reconnecting/Offline + "Last synced …" (desktop has the pill)
 * - all widths: once offline long enough to dim cards, "Showing data from HH:MM"
 */
function LiveSyncBanner({ now }: { now: number }) {
  const { liveSync, offlineDim } = useOps();
  const mode = liveSync?.mode ?? "idle";
  const synced = formatSyncedAgo(
    liveSync?.receivedAt ?? null,
    Math.max(now, Date.now())
  );

  if (offlineDim.dimmed && offlineDim.dataFrom) {
    return (
      <div
        id="offline-data-banner"
        role="status"
        className="border-t border-amber-400/20 bg-amber-500/10 text-amber-100"
      >
        <p className="mx-auto max-w-7xl px-4 py-1.5 text-xs sm:px-6">
          <span className="font-semibold">Offline</span>
          {" · "}
          <span id="offline-data-from" className="font-semibold">
            {offlineDim.dataFrom}
          </span>{" "}
          <span className="text-amber-200/80">(UK)</span>
          <span className="text-amber-200/80"> · {synced}</span>
          <span className="hidden text-amber-200/70 sm:inline">
            {" "}
            · agent cards are dimmed until the connection returns
          </span>
        </p>
      </div>
    );
  }

  if (mode !== "reconnecting" && mode !== "offline") return null;
  const offline = mode === "offline";
  return (
    <div
      id="live-sync-banner-mobile"
      role="status"
      className={`border-t sm:hidden ${
        offline
          ? "border-amber-400/20 bg-amber-500/10 text-amber-100"
          : "border-violet-400/20 bg-violet-500/10 text-violet-100"
      }`}
    >
      <p className="px-4 py-1 text-xs">
        <span className="font-semibold">
          {offline ? "Offline" : "Reconnecting…"}
        </span>
        {liveSync?.receivedAt != null && (
          <span className="opacity-80"> · {synced}</span>
        )}
      </p>
    </div>
  );
}

export function Nav() {
  const pathname = usePathname();
  const now = useNow(1000);

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
        >
          <span className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-1 ring-violet-400/30 shadow-[0_0_24px_rgba(139,92,246,0.25)]">
            <Image
              src="/paranormal-tours-logo.webp"
              alt="Paranormal Tours"
              width={72}
              height={72}
              className="h-9 w-9 object-cover"
              priority
            />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold tracking-wide text-ink-50">
              Paranormal Tours
            </p>
            <p className="truncate text-xs text-ink-400">
              Agent Ops · Codex Ignota
            </p>
          </div>
        </Link>

        <MobileLiveDot now={now} />

        {/* Phones: nav wraps to its own full-width row so every tab fits. */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <LiveIndicator now={now} />
          <nav
            aria-label="Primary"
            className="w-full overflow-x-auto rounded-full bg-white/[0.03] p-1 ring-1 ring-white/5 sm:w-auto"
          >
            <ul className="flex w-full min-w-max items-center gap-1">
              {links.map((link) => {
                const active =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(link.href);
                return (
                  <li key={link.href} className="flex-1 sm:flex-none">
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={`block whitespace-nowrap rounded-full px-3 py-1.5 text-center text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 motion-reduce:transition-none ${
                        active
                          ? "bg-violet-500/20 text-violet-100 shadow-[0_0_16px_rgba(139,92,246,0.2)]"
                          : "text-ink-300 hover:bg-white/5 hover:text-ink-100"
                      }`}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
      <LiveSyncBanner now={now} />
    </header>
  );
}
