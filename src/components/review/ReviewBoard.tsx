"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ContentPackage,
  ContentReviewListResponse,
  ContentStatus,
  ReviewActionRequest,
} from "@/lib/content-review-types";
import {
  PENDING_LABEL,
  cardSummary,
  formatLondon,
  isAwaitingManual,
  isAwaitingReview,
  isHeld,
  platformStatus,
} from "@/lib/content-review-rules";
import { refreshReviewSummary } from "@/lib/use-review-summary";
import { BlockedList } from "./BlockedList";
import { BudgetMeter } from "./BudgetMeter";
import { ExampleTag, PackageSummaryChip } from "./ContentStatusChip";
import { ReviewCard } from "./ReviewCard";
import { Toasts, type Toast } from "./Toasts";

const POLL_MS = 20_000;
/** Faster poll while any card waits for n8n to post back. */
const PENDING_POLL_MS = 8_000;

/** MOCK mode only: instant status while the request is in flight. */
const OPTIMISTIC: Record<ReviewActionRequest["action"], ContentStatus> = {
  approve: "approved",
  reject: "revising",
  kill: "killed",
  confirm_tone: "approved",
  mark_manual_done: "approved",
  mark_stale: "approved",
  pick_title: "approved",
};

const DONE_MSG: Record<ReviewActionRequest["action"], string> = {
  approve: "Approved",
  reject: "Sent back for revision",
  kill: "Item killed",
  confirm_tone: "Tone confirmed",
  mark_manual_done: "Marked posted",
  mark_stale: "Marked out of date",
  pick_title: "Title picked",
};

function approvedSummary(p: ContentPackage): string | null {
  const approved = p.platforms.filter((x) => ["approved", "scheduled", "posted", "posted_manual"].includes(platformStatus(p, x))).length;
  if (!approved) return null;
  return approved === p.platforms.length
    ? ` · approved for all ${approved} platforms`
    : ` · approved for ${approved}/${p.platforms.length} platforms`;
}

export function ReviewBoard() {
  const [data, setData] = useState<ContentReviewListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Requests in flight, keyed by packageId (the persisted pendingAction lives on the package).
  const [pending, setPending] = useState<Record<string, ReviewActionRequest["action"]>>({});
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [resetting, setResetting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const toastId = useRef(0);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const toast = useCallback((tone: Toast["tone"], message: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 8000 : 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/content-review", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/review/login?next=/review";
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ContentReviewListResponse;
      // Don't clobber cards mid-action.
      if (Object.keys(pendingRef.current).length === 0) setData(json);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load review items");
    }
  }, []);

  const anyPending = Boolean(data?.packages.some((p) => p.pendingAction));

  useEffect(() => {
    void load();
    const t = setInterval(load, anyPending ? PENDING_POLL_MS : POLL_MS);
    return () => clearInterval(t);
  }, [load, anyPending]);

  // Re-evaluate the 10-minute "No response from n8n yet" threshold.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const replacePackage = useCallback((next: ContentPackage) => {
    setData((d) =>
      d ? { ...d, packages: d.packages.map((p) => (p.packageId === next.packageId ? next : p)) } : d
    );
  }, []);

  const onRetry = useCallback(
    async (pkg: ContentPackage) => {
      setRetrying((r) => ({ ...r, [pkg.packageId]: true }));
      try {
        const res = await fetch(`/api/content-review/${encodeURIComponent(pkg.packageId)}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ retry: true, revision: pkg.revision }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          package?: ContentPackage;
          current?: ContentPackage;
        };
        if (!res.ok) {
          if (json.current) replacePackage(json.current);
          toast("error", json.error ?? `Retry failed (HTTP ${res.status}).`);
          return;
        }
        if (json.package) replacePackage(json.package);
        setNow(Date.now());
        toast("info", "Resent to n8n (same request). Waiting for the sheet to update.");
      } catch {
        toast("error", "Network error — the retry was not sent.");
      } finally {
        setRetrying((r) => ({ ...r, [pkg.packageId]: false }));
      }
    },
    [replacePackage, toast]
  );

  const onAction = useCallback(
    async (pkg: ContentPackage, req: ReviewActionRequest): Promise<boolean> => {
      if (pendingRef.current[pkg.packageId]) return false;
      setPending((p) => ({ ...p, [pkg.packageId]: req.action }));
      try {
        const res = await fetch(`/api/content-review/${encodeURIComponent(pkg.packageId)}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          mock?: boolean;
          package?: ContentPackage;
          current?: ContentPackage;
        };
        if (!res.ok) {
          if (res.status === 409 && json.current) replacePackage(json.current);
          if (res.status === 401) toast("error", "Your review session has expired. Sign in again.");
          else toast("error", json.error ?? `Action failed (HTTP ${res.status}).`);
          return false;
        }
        if (json.package) replacePackage(json.package);
        if (json.mock) toast("ok", `${DONE_MSG[req.action]} (mock — nothing sent to n8n).`);
        else toast("info", `${PENDING_LABEL[req.action]} sent to n8n. The card updates once the sheet confirms.`);
        refreshReviewSummary();
        return true;
      } catch {
        toast("error", "Network error — the action was not sent. Try again.");
        return false;
      } finally {
        setPending((p) => {
          const next = { ...p };
          delete next[pkg.packageId];
          return next;
        });
      }
    },
    [replacePackage, toast]
  );

  const onCopied = useCallback(
    (ok: boolean) => toast(ok ? "info" : "error", ok ? "Copied to clipboard." : "Could not copy — select the text instead."),
    [toast]
  );

  async function resetExamples() {
    setResetting(true);
    try {
      const res = await fetch("/api/content-review/reset-mock", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast("info", "Example data restored.");
      await load();
      refreshReviewSummary();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  async function signOut() {
    await fetch("/api/review-auth", { method: "DELETE" }).catch(() => null);
    window.location.href = "/review/login";
  }

  const packages = data?.packages ?? [];
  // Groups are derived from the platform rows, not the package status alone.
  const held = packages.filter(isHeld);
  const inReview = packages.filter(
    (p) => !isHeld(p) && (isAwaitingReview(p) || p.pendingAction || pending[p.packageId])
  );
  const manual = packages.filter(
    (p) => !isHeld(p) && !inReview.includes(p) && isAwaitingManual(p)
  );
  const blocked = packages.filter((p) => p.status === "blocked");
  const shown = new Set([...held, ...inReview, ...manual, ...blocked].map((p) => p.packageId));
  const actioned = packages.filter((p) => !shown.has(p.packageId));
  const mode = data?.mode;

  const renderCard = (p: ContentPackage) => {
    const inflight = pending[p.packageId];
    return (
      <ReviewCard
        key={p.packageId}
        pkg={p}
        busyLabel={inflight ? (mode?.mock ? "Saving…" : PENDING_LABEL[inflight]) : undefined}
        optimisticStatus={inflight && mode?.mock ? OPTIMISTIC[inflight] : undefined}
        now={now}
        retrying={Boolean(retrying[p.packageId])}
        onAction={onAction}
        onRetry={onRetry}
        onCopied={onCopied}
      />
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-violet-300/80">Founder review</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-50">Content review</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-300">
            Watch each daily video, check the copy for every platform, then approve or send it back.
            All times are UK time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode?.mock && (
            <button type="button" className="btn-ghost" onClick={resetExamples} disabled={resetting}>
              {resetting ? "Resetting…" : "Reset example data"}
            </button>
          )}
          {mode?.protected && (
            <button type="button" className="btn-ghost" onClick={signOut}>
              Sign out
            </button>
          )}
        </div>
      </div>

      {mode && !mode.protected && (
        <div role="alert" className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-100 ring-1 ring-amber-400/40">
          <p className="font-semibold">Unprotected{mode.mock ? " — mock mode" : ""}</p>
          <p className="mt-0.5 text-amber-100/80">
            Anyone with this link can use this page. Set <code className="font-mono">REVIEW_ADMIN_PASSWORD</code>{" "}
            before real approvals go live.
            {mode.mock && " Actions only update the dashboard’s own copy; nothing is sent to n8n."}
          </p>
        </div>
      )}
      {mode && mode.protected && mode.mock && (
        <div className="rounded-xl bg-violet-500/10 px-4 py-3 text-sm text-violet-100 ring-1 ring-violet-400/30">
          <p className="font-semibold">Mock mode</p>
          <p className="mt-0.5 text-violet-100/80">
            The n8n webhook isn’t configured, so actions only update the dashboard’s own copy.
          </p>
        </div>
      )}

      {data && <BudgetMeter budget={data.budget} />}

      {loadError && (
        <p role="alert" className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-100 ring-1 ring-rose-400/30">
          Couldn’t load review items ({loadError}). Retrying automatically.
        </p>
      )}

      {held.length > 0 && (
        <section aria-labelledby="held-heading" className="space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="held-heading" className="text-sm font-semibold uppercase tracking-wider text-amber-300">
              Held by the publisher
            </h2>
            <p className="text-xs text-ink-500">{held.length} item(s) · publishing paused on some platforms</p>
          </div>
          {held.map(renderCard)}
        </section>
      )}

      <section aria-labelledby="awaiting-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="awaiting-heading" className="text-sm font-semibold uppercase tracking-wider text-violet-300/90">
            Awaiting review
          </h2>
          <p className="text-xs text-ink-500">{data ? `${inReview.length} item(s)` : "Loading…"}</p>
        </div>
        {data && inReview.length === 0 && (
          <p className="card px-4 py-3 text-sm text-ink-400">Nothing waiting for review. Nice.</p>
        )}
        {inReview.map(renderCard)}
      </section>

      {manual.length > 0 && (
        <section aria-labelledby="manual-heading" className="space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="manual-heading" className="text-sm font-semibold uppercase tracking-wider text-blue-300">
              To finish by hand
            </h2>
            <p className="text-xs text-ink-500">{manual.length} item(s) · post in the app, then mark posted</p>
          </div>
          {manual.map(renderCard)}
        </section>
      )}

      {actioned.length > 0 && (
        <section aria-labelledby="actioned-heading" className="space-y-3">
          <h2 id="actioned-heading" className="text-sm font-semibold uppercase tracking-wider text-ink-300">
            Recently actioned
          </h2>
          <ul className="space-y-2">
            {actioned.map((p) => (
              <li key={p.packageId} className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink-100">{p.subject}</p>
                    {p.example && <ExampleTag />}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Revision {p.revisionCount}/{p.revisionCap} · updated {formatLondon(p.updatedAt)}
                    {approvedSummary(p)}
                    {p.lastSource === "sheet" && " · Updated from sheet"}
                  </p>
                </div>
                <PackageSummaryChip status={p.status} summary={cardSummary(p)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && <BlockedList items={blocked} />}

      <p className="text-xs text-ink-500">
        Back to <Link href="/" className="text-violet-200 hover:underline">Overview</Link>.
      </p>

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
