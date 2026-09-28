"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ContentPackage,
  ContentReviewListResponse,
  ContentStatus,
  ReviewActionRequest,
} from "@/lib/content-review-types";
import { formatLondon } from "@/lib/content-review-rules";
import { refreshReviewSummary } from "@/lib/use-review-summary";
import { BlockedList } from "./BlockedList";
import { BudgetMeter } from "./BudgetMeter";
import { ContentStatusChip, ExampleTag } from "./ContentStatusChip";
import { ReviewCard } from "./ReviewCard";
import { Toasts, type Toast } from "./Toasts";

const POLL_MS = 20_000;

const OPTIMISTIC: Record<ReviewActionRequest["action"], ContentStatus> = {
  approve: "approved",
  reject: "revising",
  kill: "rejected",
};

const DONE_MSG: Record<ReviewActionRequest["action"], string> = {
  approve: "Approved",
  reject: "Sent back for revision",
  kill: "Item killed",
};

export function ReviewBoard() {
  const [data, setData] = useState<ContentReviewListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, ContentStatus>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [resetting, setResetting] = useState(false);
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

  useEffect(() => {
    void load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const replacePackage = useCallback((next: ContentPackage) => {
    setData((d) =>
      d ? { ...d, packages: d.packages.map((p) => (p.contentId === next.contentId ? next : p)) } : d
    );
  }, []);

  const onAction = useCallback(
    async (pkg: ContentPackage, req: ReviewActionRequest): Promise<boolean> => {
      if (pendingRef.current[pkg.contentId]) return false;
      setPending((p) => ({ ...p, [pkg.contentId]: OPTIMISTIC[req.action] }));
      try {
        const res = await fetch(`/api/content-review/${encodeURIComponent(pkg.contentId)}/action`, {
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
        toast("ok", `${DONE_MSG[req.action]}${json.mock ? " (mock — nothing sent to n8n)" : ""}.`);
        refreshReviewSummary();
        return true;
      } catch {
        toast("error", "Network error — the action was not sent. Try again.");
        return false;
      } finally {
        setPending((p) => {
          const next = { ...p };
          delete next[pkg.contentId];
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
  const inReview = packages.filter((p) => p.status === "review" || pending[p.contentId]);
  const blocked = packages.filter((p) => p.status === "blocked");
  const actioned = packages.filter(
    (p) => p.status !== "review" && p.status !== "blocked" && !pending[p.contentId]
  );
  const mode = data?.mode;

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
        {inReview.map((p) => (
          <ReviewCard
            key={p.contentId}
            pkg={p}
            pending={Boolean(pending[p.contentId])}
            optimisticStatus={pending[p.contentId]}
            onAction={onAction}
            onCopied={onCopied}
          />
        ))}
      </section>

      {actioned.length > 0 && (
        <section aria-labelledby="actioned-heading" className="space-y-3">
          <h2 id="actioned-heading" className="text-sm font-semibold uppercase tracking-wider text-ink-300">
            Recently actioned
          </h2>
          <ul className="space-y-2">
            {actioned.map((p) => (
              <li key={p.contentId} className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink-100">{p.subject}</p>
                    {p.example && <ExampleTag />}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Revision {p.revisionCount}/{p.revisionCap} · updated {formatLondon(p.updatedAt)}
                    {p.platforms.some((x) => x.status === "approved") &&
                      ` · approved for ${p.platforms.filter((x) => x.status === "approved").length} platform(s)`}
                  </p>
                </div>
                <ContentStatusChip status={p.status} />
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
