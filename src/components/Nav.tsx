"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatSyncedAgo } from "@/lib/live-sync";
import { useOps } from "@/lib/store";

const links = [
  { href: "/", label: "Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/board", label: "Board" },
  { href: "/codex", label: "Codex" },
];

function LiveIndicator() {
  const { liveSync } = useOps();
  const mode = liveSync?.mode ?? "idle";
  const [now, setNow] = useState(() => Date.now());

  // Display-only 1s tick for "Last synced Ns ago" (doesn't affect staleness).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  let label = "Live sync off";
  let className = "text-ink-500 ring-white/10";
  let dot = "";
  if (mode === "live") {
    label = "Live · 5s";
    className = "text-teal-200 ring-teal-400/30 bg-teal-500/10";
    dot = "animate-pulse bg-teal-400";
  } else if (mode === "polling") {
    label = "Polling…";
    className = "text-violet-200 ring-violet-400/30 bg-violet-500/10";
  } else if (mode === "reconnecting") {
    label = "Reconnecting…";
    className = "text-violet-200 ring-violet-400/30 bg-violet-500/10";
    dot = "bg-violet-400";
  } else if (mode === "offline") {
    label = "Offline";
    className = "text-amber-200 ring-amber-400/30 bg-amber-500/10";
    dot = "bg-amber-400";
  }

  const synced = formatSyncedAgo(liveSync?.receivedAt ?? null, now);
  const title = [
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

  return (
    <span
      id="live-indicator"
      className={`hidden items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 sm:inline-flex ${className}`}
      title={title || undefined}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
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

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-3">
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
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-wide text-ink-50">
              Paranormal Tours
            </p>
            <p className="text-xs text-ink-400">Agent Ops · Codex Ignota</p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <LiveIndicator />
          <nav className="flex items-center gap-1 rounded-full bg-white/[0.03] p-1 ring-1 ring-white/5">
            {links.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    active
                      ? "bg-violet-500/20 text-violet-100 shadow-[0_0_16px_rgba(139,92,246,0.2)]"
                      : "text-ink-300 hover:bg-white/5 hover:text-ink-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
