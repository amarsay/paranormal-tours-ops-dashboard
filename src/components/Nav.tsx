"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/board", label: "Board" },
  { href: "/codex", label: "Codex" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/40 to-teal-500/30 ring-1 ring-violet-400/30 shadow-[0_0_24px_rgba(139,92,246,0.25)]">
            <span className="text-sm font-semibold tracking-tight text-violet-100">
              PT
            </span>
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-wide text-ink-50">
              Paranormal Tours
            </p>
            <p className="text-xs text-ink-400">Agent Ops · Codex Ignota</p>
          </div>
        </Link>

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
    </header>
  );
}
