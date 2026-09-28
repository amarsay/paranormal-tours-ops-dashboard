"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  ContentPackage,
  PlatformId,
  ReviewActionRequest,
  ReviewStage,
} from "@/lib/content-review-types";
import { PLATFORM_LABELS, REVIEW_STAGES } from "@/lib/content-review-types";
import {
  estimateRedoCostGbp,
  formatGbp,
  isAtCap,
  platformStatus,
  platformsInReview,
  toneConfirmedForCurrent,
  validateAction,
} from "@/lib/content-review-rules";
import { ContentStatusChip } from "./ContentStatusChip";

const STAGE_LABELS: Record<ReviewStage, string> = {
  script: "Script",
  visuals: "Visuals",
  voice: "Voice",
  music: "Music",
  copy: "Copy",
};

export function ActionPanel({
  pkg,
  pending,
  selectedTitle,
  onAction,
}: {
  pkg: ContentPackage;
  pending: boolean;
  /** Chosen YouTube title (null when there are no options or none picked yet). */
  selectedTitle: string | null;
  onAction: (req: ReviewActionRequest) => Promise<boolean>;
}) {
  const uid = useId();
  // Only rows still in review can be approved; rows decided in the sheet are shown read-only.
  const platformsKey = platformsInReview(pkg).join(",");
  const allPlatforms = useMemo(
    () => (platformsKey ? (platformsKey.split(",") as PlatformId[]) : []),
    [platformsKey]
  );
  const partial = allPlatforms.length < pkg.platforms.length;
  const atCap = isAtCap(pkg);
  const toneForRevision = toneConfirmedForCurrent(pkg);

  const [approveSet, setApproveSet] = useState<PlatformId[]>(allPlatforms);
  // The tick is per revision: pre-checked only if confirmed for THIS revision.
  const [toneChecked, setToneChecked] = useState(toneForRevision);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [stages, setStages] = useState<ReviewStage[]>([]);
  const [rejectPlatforms, setRejectPlatforms] = useState<PlatformId[]>([]);
  const [killConfirm, setKillConfirm] = useState(false);

  const rejectHeadingRef = useRef<HTMLHeadingElement>(null);
  const rejectToggleRef = useRef<HTMLButtonElement>(null);

  // Reset local form state when a new revision arrives.
  useEffect(() => {
    setApproveSet(allPlatforms);
    setToneChecked(toneForRevision);
    setRejectOpen(false);
    setFeedback("");
    setStages([]);
    setRejectPlatforms([]);
    setKillConfirm(false);
  }, [pkg.revision, allPlatforms, toneForRevision]);

  useEffect(() => {
    if (rejectOpen) rejectHeadingRef.current?.focus();
  }, [rejectOpen]);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const approveReq: ReviewActionRequest = {
    action: "approve",
    revision: pkg.revision,
    platforms: approveSet,
    toneChecked,
    ...(selectedTitle && approveSet.includes("youtube") ? { selectedTitle } : {}),
  };
  const approveCheck = validateAction(pkg, approveReq);
  const allTicked = approveSet.length === allPlatforms.length;

  const rejectReq: ReviewActionRequest = {
    action: "reject",
    revision: pkg.revision,
    stages,
    platforms: rejectPlatforms,
    feedback,
  };
  const rejectCheck = validateAction(pkg, rejectReq);
  const redoCost = estimateRedoCostGbp(pkg.stageCostEstimatesGbp, stages);

  async function submitReject() {
    const ok = await onAction(rejectReq);
    if (ok) {
      setRejectOpen(false);
      rejectToggleRef.current?.focus();
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-white/5 bg-ink-950/40 p-3">
      {/* Approve */}
      <fieldset className="space-y-2" disabled={pending}>
        <legend className="text-sm font-semibold text-ink-100">
          Approve{partial ? " remaining platforms" : ""}
        </legend>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {pkg.platforms.map((p) => {
            const st = platformStatus(pkg, p);
            if (st !== "review") {
              return (
                <span key={p.platform} className="inline-flex items-center gap-1.5 text-xs text-ink-500">
                  {PLATFORM_LABELS[p.platform]}
                  <ContentStatusChip status={st} at={p.postedAt} />
                </span>
              );
            }
            return (
              <label key={p.platform} className="inline-flex items-center gap-1.5 text-xs text-ink-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-teal-500"
                  checked={approveSet.includes(p.platform)}
                  onChange={() => setApproveSet((s) => toggle(s, p.platform))}
                />
                {PLATFORM_LABELS[p.platform]}
              </label>
            );
          })}
          <button
            type="button"
            className="text-xs text-violet-200 underline-offset-2 hover:underline"
            onClick={() => setApproveSet(allTicked ? [] : allPlatforms)}
          >
            {allTicked ? "Untick all" : "Tick all"}
          </button>
        </div>
        {pkg.sensitive && (
          <label className="flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-100 ring-1 ring-rose-400/30">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-rose-500"
              checked={toneChecked}
              onChange={(e) => setToneChecked(e.target.checked)}
            />
            <span>
              I&apos;ve checked tone and CTA
              <span className="block text-xs text-rose-200/70">
                Required for SENSITIVE items: respectful tone, no visit CTA for restricted sites.
                Applies to revision {pkg.revision} only; a new revision needs a fresh tick.
              </span>
            </span>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
            disabled={pending || !approveCheck.ok}
            onClick={() => onAction(approveReq)}
          >
            {pending
              ? "Working…"
              : allTicked && !partial
                ? "Approve all platforms"
                : allTicked
                  ? `Approve remaining ${approveSet.length}`
                  : `Approve ${approveSet.length} platform${approveSet.length === 1 ? "" : "s"}`}
          </button>
          {!approveCheck.ok && !pending && (
            <p className="text-xs text-ink-400" aria-live="polite">
              {approveCheck.error}
            </p>
          )}
        </div>
      </fieldset>

      <div className="border-t border-white/5" />

      {/* Reject / Kill */}
      {atCap ? (
        <div className="space-y-2">
          <p className="text-sm text-amber-100">
            Revision cap reached ({pkg.revisionCount}/{pkg.revisionCap}). Reject is disabled; you can
            approve it as it is or kill the item.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary cursor-not-allowed opacity-40" disabled aria-disabled>
              Reject (cap reached)
            </button>
            {!killConfirm ? (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl bg-rose-500/20 px-4 py-2 text-sm font-medium text-rose-100 ring-1 ring-rose-400/40 transition hover:bg-rose-500/30 disabled:opacity-40"
                disabled={pending}
                onClick={() => setKillConfirm(true)}
              >
                Kill item
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm kill">
                <span className="text-xs text-rose-200">Stop this item for good? No regeneration.</span>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl bg-rose-600/80 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-rose-400/60 disabled:opacity-40"
                  disabled={pending}
                  onClick={() => onAction({ action: "kill", revision: pkg.revision })}
                  autoFocus
                >
                  {pending ? "Working…" : "Yes, kill it"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setKillConfirm(false)} disabled={pending}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            ref={rejectToggleRef}
            type="button"
            className="btn-secondary disabled:opacity-40"
            aria-expanded={rejectOpen}
            aria-controls={`${uid}-reject`}
            disabled={pending}
            onClick={() => setRejectOpen((o) => !o)}
          >
            {rejectOpen ? "Close reject panel" : "Reject…"}
          </button>

          {rejectOpen && (
            <section
              id={`${uid}-reject`}
              aria-labelledby={`${uid}-reject-heading`}
              className="space-y-3 rounded-xl border border-rose-400/20 bg-rose-950/20 p-3"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setRejectOpen(false);
                  rejectToggleRef.current?.focus();
                }
              }}
            >
              <h4
                id={`${uid}-reject-heading`}
                ref={rejectHeadingRef}
                tabIndex={-1}
                className="text-sm font-semibold text-rose-100 outline-none"
              >
                Send back for revision {pkg.revisionCount + 1}/{pkg.revisionCap}
              </h4>

              <div className="space-y-1">
                <label htmlFor={`${uid}-feedback`} className="text-xs font-medium text-ink-200">
                  What needs changing? <span className="text-rose-300">(required)</span>
                </label>
                <textarea
                  id={`${uid}-feedback`}
                  className="input min-h-[88px] w-full"
                  required
                  aria-required
                  value={feedback}
                  maxLength={4000}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g. Hook is too slow; lose the second scene."
                  disabled={pending}
                />
              </div>

              <fieldset className="space-y-1" disabled={pending}>
                <legend className="text-xs font-medium text-ink-200">
                  Stages to redo <span className="text-rose-300">(at least one)</span>
                </legend>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {REVIEW_STAGES.map((s) => (
                    <label key={s} className="inline-flex items-center gap-1.5 text-xs text-ink-200">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-rose-500"
                        checked={stages.includes(s)}
                        onChange={() => setStages((x) => toggle(x, s))}
                      />
                      {STAGE_LABELS[s]}
                      <span className="text-ink-500">({formatGbp(pkg.stageCostEstimatesGbp?.[s] ?? 0)})</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-1" disabled={pending}>
                <legend className="text-xs font-medium text-ink-200">
                  Platforms affected{" "}
                  <span className="text-ink-500">(required when Copy is the only stage)</span>
                </legend>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {pkg.platforms.map((p) => (
                    <label key={p.platform} className="inline-flex items-center gap-1.5 text-xs text-ink-200">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-rose-500"
                        checked={rejectPlatforms.includes(p.platform)}
                        onChange={() => setRejectPlatforms((x) => toggle(x, p.platform))}
                      />
                      {PLATFORM_LABELS[p.platform]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <p className="text-sm text-ink-100" aria-live="polite">
                Estimated redo cost <strong className="text-amber-200">{formatGbp(redoCost)}</strong>
                {pkg.example && <span className="ml-1 text-xs text-amber-200/70">(example figures)</span>}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl bg-rose-500/25 px-4 py-2 text-sm font-medium text-rose-50 ring-1 ring-rose-400/50 transition hover:bg-rose-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={pending || !rejectCheck.ok}
                  onClick={submitReject}
                >
                  {pending ? "Sending…" : `Reject · redo ${formatGbp(redoCost)}`}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={pending}
                  onClick={() => {
                    setRejectOpen(false);
                    rejectToggleRef.current?.focus();
                  }}
                >
                  Cancel
                </button>
                {!rejectCheck.ok && (
                  <p className="text-xs text-ink-400" aria-live="polite">
                    {rejectCheck.error}
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
