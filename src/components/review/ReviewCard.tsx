"use client";

import { useEffect, useState } from "react";
import type { ContentPackage, ContentStatus, QaCheck, ReviewActionRequest } from "@/lib/content-review-types";
import {
  KNOWN_VISUAL_PROVIDERS,
  KNOWN_VOICE_PROVIDERS,
  PLATFORM_LABELS,
} from "@/lib/content-review-types";
import {
  PENDING_LABEL,
  formatGbp,
  formatLondon,
  isAwaitingReview,
  isPendingStale,
  pendingAgeMs,
  cardSummary,
  platformStatus,
  platformsHeld,
  platformsHeldTitle,
  platformsHeldRelease,
  platformsAwaitingManual,
  toneConfirmedForCurrent,
  youtubeTitleOptions,
} from "@/lib/content-review-rules";
import { ActionPanel } from "./ActionPanel";
import {
  AiIllustrationTag,
  ContentStatusChip,
  SummaryChip,
  CredibilityChip,
  ExampleTag,
  HOLD_REASON_LABELS,
  PendingChip,
  PromoChip,
  QaFlaggedChip,
  UnknownProviderChip,
  SensitiveBadge,
} from "./ContentStatusChip";
import { PlatformTabs } from "./PlatformTabs";
import { ScriptPanel } from "./ScriptPanel";

function VideoPreview({ pkg }: { pkg: ContentPackage }) {
  const v = pkg.video;
  if (v?.url) {
    return (
      <video
        className="aspect-[9/16] w-full rounded-xl bg-black object-cover ring-1 ring-white/10"
        controls
        preload="metadata"
        playsInline
        poster={v.poster ?? undefined}
        aria-label={`Video preview: ${pkg.subject}`}
        crossOrigin={v.captionsVtt?.startsWith("http") ? "anonymous" : undefined}
      >
        <source src={v.url} type="video/mp4" />
        {v.captionsVtt && (
          <track kind="captions" src={v.captionsVtt} srcLang="en-GB" label="English (UK)" default />
        )}
        Your browser cannot play this video.{" "}
        <a href={v.url} className="underline">
          Open the MP4
        </a>
        .
      </video>
    );
  }
  return (
    <div
      className="relative flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded-xl bg-ink-950 ring-1 ring-white/10"
      role="img"
      aria-label="No video preview available"
    >
      {v?.poster ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
          <div className="absolute inset-x-0 bottom-0 bg-ink-950/85 px-3 py-2 text-center">
            <p className="text-xs font-medium text-ink-200">No preview in mock</p>
            <p className="mt-0.5 text-[11px] text-ink-500">Poster only — the render URL arrives with the real package.</p>
          </div>
        </>
      ) : (
        <div className="relative px-4 text-center">
          <p className="text-sm font-medium text-ink-200">No preview in mock</p>
          <p className="mt-1 text-xs text-ink-500">No render attached yet.</p>
        </div>
      )}
    </div>
  );
}

const QA_LABELS: Record<QaCheck, string> = {
  duration: "Duration",
  first_word: "First word",
  scene_length: "Scene length",
  loudness: "Loudness",
};

function QaFlagsPanel({ pkg }: { pkg: ContentPackage }) {
  const flags = pkg.qaFlags ?? [];
  if (!flags.length) return null;
  return (
    <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-100 ring-1 ring-amber-400/40">
      <p className="font-semibold">QA flagged after render</p>
      <ul className="mt-1 space-y-0.5 text-xs text-amber-100/85">
        {flags.map((f, i) => (
          <li key={`${f.check}-${i}`}>
            <span className="font-mono text-amber-200">{QA_LABELS[f.check] ?? f.check}</span>
            {f.detail ? ` — ${f.detail}` : ""}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-amber-100/70">You can still approve; it&apos;s your call.</p>
    </div>
  );
}

function minutesAgo(ms: number): string {
  const m = Math.floor(ms / 60000);
  return m < 1 ? "just now" : m === 1 ? "1 min ago" : `${m} min ago`;
}

/** Per-platform decision strip (shows partial approvals and held rows). */
function PlatformStatusStrip({ pkg }: { pkg: ContentPackage }) {
  if (pkg.platforms.length === 0) return null;
  const decided = pkg.platforms.filter((p) => platformStatus(pkg, p) !== "review").length;
  if (decided === 0) return null;
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        Per platform · {decided}/{pkg.platforms.length} decided
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
        {pkg.platforms.map((p) => (
          <li key={p.platform} className="inline-flex items-center gap-1.5 text-xs text-ink-300">
            {PLATFORM_LABELS[p.platform]}
            <ContentStatusChip status={platformStatus(pkg, p)} at={p.postedAt} holdReason={p.holdReason} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PendingBanner({
  pkg,
  now,
  retrying,
  onRetry,
}: {
  pkg: ContentPackage;
  now: number;
  retrying: boolean;
  onRetry: () => void;
}) {
  const pa = pkg.pendingAction;
  if (!pa) return null;
  const stale = isPendingStale(pkg, now);
  const age = minutesAgo(pendingAgeMs(pkg, now));
  if (!stale) {
    return (
      <div role="status" className="rounded-xl bg-violet-500/10 px-3 py-2 text-sm text-violet-100 ring-1 ring-violet-400/30">
        <p className="font-semibold">{PENDING_LABEL[pa.action]}</p>
        <p className="mt-0.5 text-xs text-violet-100/80">
          Sent to n8n {age} ({formatLondon(pa.lastSentAt || pa.at)} UK). The card updates when n8n writes the sheet
          and posts the new state back.
        </p>
      </div>
    );
  }
  return (
    <div role="alert" className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-100 ring-1 ring-amber-400/50">
      <p className="font-semibold">No response from n8n yet</p>
      <p className="mt-0.5 text-xs text-amber-100/80">
        {PENDING_LABEL[pa.action].replace("…", "")} was sent {age} ({formatLondon(pa.lastSentAt || pa.at)} UK) and the
        sheet hasn&apos;t confirmed it. Retry resends the same request (revision {pa.payload.revision}), so n8n can ignore
        a duplicate.{(pa.attempts ?? 1) > 1 ? ` Attempts so far: ${pa.attempts}.` : ""}
      </p>
      <button
        type="button"
        className="mt-2 inline-flex items-center justify-center rounded-xl bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-50 ring-1 ring-amber-400/50 transition hover:bg-amber-500/30 disabled:opacity-40"
        onClick={onRetry}
        disabled={retrying}
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

function HeldBanner({
  pkg,
  busy,
  onConfirm,
}: {
  pkg: ContentPackage;
  busy: boolean;
  onConfirm: () => void;
}) {
  const held = platformsHeld(pkg);
  if (held.length === 0) return null;
  const confirmed = toneConfirmedForCurrent(pkg);
  const names = held.map((id) => PLATFORM_LABELS[id]).join(", ");
  return (
    <div role="alert" className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-100 ring-1 ring-amber-400/60">
      <p className="font-semibold">Held: tone check missing</p>
      <p className="mt-0.5 text-xs text-amber-100/80">
        The publisher is holding {names} because tone_checked isn&apos;t TRUE for revision {pkg.revision}. Other
        platforms keep their own status.
      </p>
      {pkg.sensitive && !confirmed && (
        <button
          type="button"
          className="mt-2 inline-flex items-center justify-center rounded-xl bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-50 ring-1 ring-amber-400/50 transition hover:bg-amber-500/30 disabled:opacity-40"
          onClick={onConfirm}
          disabled={busy || Boolean(pkg.pendingAction)}
        >
          I&apos;ve checked tone and CTA (revision {pkg.revision})
        </button>
      )}
      {confirmed && (
        <p className="mt-1 text-xs text-amber-100/80">
          Tone confirmed for revision {pkg.revision}; waiting for the publisher to release the rows.
        </p>
      )}
    </div>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  elevenlabs: "ElevenLabs",
  xai_voice: "xAI voice",
  xai_grok: "xAI Grok",
};

/** Read-only meta line: voice / visual provider and Codex link. */
function ProviderMeta({ pkg }: { pkg: ContentPackage }) {
  const { voiceProvider, visualProvider, codexUrl } = pkg;
  if (!voiceProvider && !visualProvider && !codexUrl) return null;
  const item = (label: string, v: string, known: readonly string[]) => (
    <span className="inline-flex items-center gap-1">
      <span className="text-ink-500">{label}:</span> {PROVIDER_LABELS[v] ?? v}
      {!known.includes(v) && <UnknownProviderChip value={v} />}
    </span>
  );
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-300">
      {voiceProvider && item("Voice", voiceProvider, KNOWN_VOICE_PROVIDERS)}
      {visualProvider && item("Visuals", visualProvider, KNOWN_VISUAL_PROVIDERS)}
      {codexUrl && (
        <a href={codexUrl} target="_blank" rel="noopener noreferrer" className="text-violet-200 underline-offset-2 hover:underline">
          Codex entry ↗
        </a>
      )}
    </p>
  );
}

function ErrorBanner({ pkg }: { pkg: ContentPackage }) {
  if (!pkg.lastError) return null;
  return (
    <div role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-100 ring-1 ring-rose-400/40">
      <p className="font-semibold">n8n reported a problem</p>
      <p className="mt-0.5 text-xs text-rose-100/85">{pkg.lastError.message}</p>
    </div>
  );
}

function HeldReleaseBanner({ pkg }: { pkg: ContentPackage }) {
  const rows = platformsHeldRelease(pkg);
  if (rows.length === 0) return null;
  return (
    <div role="alert" className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-100 ring-1 ring-amber-400/60">
      <p className="font-semibold">Held at release</p>
      <ul className="mt-0.5 space-y-0.5 text-xs text-amber-100/85">
        {rows.map((r) => (
          <li key={r.platform}>
            {PLATFORM_LABELS[r.platform]}: {r.holdReason ? HOLD_REASON_LABELS[r.holdReason].replace("Held at release: ", "") : "reason not given"}
            {" "}— the private upload won&apos;t be made public until this is cleared.
          </li>
        ))}
      </ul>
    </div>
  );
}

/** published_private rows: founder can declare them out of date so they never go public. */
function PrivateUploadPanel({
  pkg,
  busy,
  onStale,
}: {
  pkg: ContentPackage;
  busy: boolean;
  onStale: (platform: ContentPackage["platforms"][number]["platform"]) => void;
}) {
  const rows = pkg.platforms.filter((p) => platformStatus(pkg, p) === "published_private");
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl bg-slate-500/10 px-3 py-2 text-sm text-slate-200 ring-1 ring-slate-400/30">
      <p className="font-semibold">Uploaded private (audit pending)</p>
      <p className="mt-0.5 text-xs text-slate-300/80">
        Not live. If it&apos;s no longer right to publish, mark it out of date and it won&apos;t be released.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {rows.map((r) => (
          <li key={r.platform} className="inline-flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1 text-xs">
            {PLATFORM_LABELS[r.platform]}
            <button
              type="button"
              className="rounded-lg bg-slate-500/25 px-2 py-1 text-xs font-medium text-slate-50 ring-1 ring-slate-400/50 transition hover:bg-slate-500/35 disabled:opacity-40"
              disabled={busy || Boolean(pkg.pendingAction)}
              onClick={() => onStale(r.platform)}
            >
              Mark out of date
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HeldTitleBanner({ pkg }: { pkg: ContentPackage }) {
  if (platformsHeldTitle(pkg).length === 0) return null;
  const yt = pkg.platforms.find((p) => p.platform === "youtube");
  const offending = yt && "selectedTitle" in yt ? yt.selectedTitle : null;
  return (
    <div role="alert" className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-100 ring-1 ring-amber-400/60">
      <p className="font-semibold">Held: title failed check</p>
      <p className="mt-0.5 text-xs text-amber-100/80">
        YouTube is held because the hand-typed title failed the banned-phrase check:
      </p>
      <p className="mt-1 rounded-md bg-black/30 px-2 py-1 font-mono text-xs text-amber-50">
        {offending ? `“${offending}”` : "(title not sent)"}
      </p>
      <p className="mt-1 text-xs text-amber-100/80">
        Pick one of the generated options on the YouTube tab and press &ldquo;Use this title&rdquo; (or set the
        sheet&apos;s selected_title). Other platforms keep their own status.
      </p>
    </div>
  );
}

function ManualPanel({
  pkg,
  busy,
  onDone,
}: {
  pkg: ContentPackage;
  busy: boolean;
  onDone: (platform: ContentPackage["platforms"][number]["platform"]) => void;
}) {
  const rows = platformsAwaitingManual(pkg);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl bg-blue-500/10 px-3 py-2 text-sm text-blue-100 ring-1 ring-blue-400/40">
      <p className="font-semibold">Finish in app</p>
      <p className="mt-0.5 text-xs text-blue-100/80">
        These platforms need posting by hand (TikTok inbox draft, Lemon8). Use the copy on each tab, then mark it posted.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {rows.map((id) => (
          <li key={id} className="inline-flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1 text-xs">
            {PLATFORM_LABELS[id]}
            <button
              type="button"
              className="rounded-lg bg-blue-500/25 px-2 py-1 text-xs font-medium text-blue-50 ring-1 ring-blue-400/50 transition hover:bg-blue-500/35 disabled:opacity-40"
              disabled={busy || Boolean(pkg.pendingAction)}
              onClick={() => onDone(id)}
            >
              Mark posted
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReviewCard({
  pkg,
  busyLabel,
  optimisticStatus,
  now,
  retrying,
  onAction,
  onRetry,
  onCopied,
}: {
  pkg: ContentPackage;
  /** Request in flight (mock: "Saving…"; real: "Approving…" etc.). */
  busyLabel?: string;
  /** Mock mode only: instant status while the request is in flight. */
  optimisticStatus?: ContentStatus;
  now: number;
  retrying: boolean;
  onAction: (pkg: ContentPackage, req: ReviewActionRequest) => Promise<boolean>;
  onRetry: (pkg: ContentPackage) => void;
  onCopied: (ok: boolean) => void;
}) {
  const busy = Boolean(busyLabel);
  const pa = pkg.pendingAction;
  const scheduleTimes = Array.from(
    new Set(pkg.platforms.map((p) => p.scheduleAt).filter((x): x is string => Boolean(x)))
  ).sort();
  const actionable = isAwaitingReview(pkg) && !pa;
  const titleOptions = youtubeTitleOptions(pkg);
  const ytRow = pkg.platforms.find((p) => p.platform === "youtube");
  // The sheet is truth for the title: pre-select the stored pick when it's one of the options.
  const storedTitle = ytRow && "selectedTitle" in ytRow ? (ytRow.selectedTitle ?? null) : null;
  const initialTitle = storedTitle && titleOptions.includes(storedTitle) ? storedTitle : null;
  const [selectedTitle, setSelectedTitle] = useState<string | null>(initialTitle);
  const titleKey = titleOptions.join("|");
  useEffect(() => setSelectedTitle(initialTitle), [pkg.revision, titleKey, initialTitle]);
  // Any row status other than `review` means the title decision is made (incl. published_private).
  const ytDecided = Boolean(ytRow && platformStatus(pkg, ytRow) !== "review");
  const summary = cardSummary(pkg);

  return (
    <article
      id={`pkg-${pkg.packageId}`}
      className={`card grid gap-4 p-4 sm:p-5 lg:grid-cols-[260px,1fr] ${
        pkg.sensitive ? "border-rose-400/25" : ""
      } ${summary.kind === "held" ? "border-amber-400/40" : ""} ${busy ? "opacity-80" : ""}`}
      aria-labelledby={`subject-${pkg.packageId}`}
      aria-busy={busy || Boolean(pa)}
    >
      <div className="mx-auto w-full max-w-[260px]">
        <VideoPreview pkg={pkg} />
        {pkg.video?.durationSec ? (
          <p className="mt-1 text-center text-xs text-ink-500">{pkg.video.durationSec}s · 9:16</p>
        ) : null}
      </div>

      <div className="min-w-0 space-y-4">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {summary.kind === "killed" && !optimisticStatus ? (
              <ContentStatusChip status="killed" />
            ) : (summary.kind === "held" || summary.kind === "manual") && !optimisticStatus ? (
              <>
                <SummaryChip kind={summary.kind} count={summary.count} />
                {/* Worst row state wins the summary; an in-flight action still shows beside it. */}
                {(pa || busyLabel) && <PendingChip label={pa ? PENDING_LABEL[pa.action] : busyLabel!} />}
              </>
            ) : pa ? (
              <PendingChip label={PENDING_LABEL[pa.action]} />
            ) : busyLabel && !optimisticStatus ? (
              <PendingChip label={busyLabel} />
            ) : summary.kind === "out_of_date" && !optimisticStatus ? (
              <SummaryChip kind="out_of_date" count={summary.count} />
            ) : (
              <ContentStatusChip status={optimisticStatus ?? pkg.status} />
            )}
            {busy && optimisticStatus && <span className="text-xs text-ink-400">Saving…</span>}
            <CredibilityChip label={pkg.credibilityLabel} />
            {pkg.contentType === "promo" ? <PromoChip /> : pkg.aiIllustration && <AiIllustrationTag />}
            {pkg.sensitive && <SensitiveBadge />}
            {(pkg.qaFlags?.length ?? 0) > 0 && <QaFlaggedChip count={pkg.qaFlags!.length} />}
            {pkg.example && <ExampleTag />}
          </div>
          <h3 id={`subject-${pkg.packageId}`} className="text-lg font-semibold leading-snug text-ink-50">
            {pkg.subject}
          </h3>
          <ProviderMeta pkg={pkg} />
          {pkg.lastSource === "sheet" && (
            <p className="text-[11px] text-ink-500">
              <span className="text-teal-300/80">Updated from sheet</span>
              {pkg.lastSourceAt ? ` · ${formatLondon(pkg.lastSourceAt)} UK` : ""}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-ink-500">Source</dt>
              <dd className="text-ink-200">
                {pkg.sheetRef.sheetUrl ? (
                  <a
                    href={pkg.sheetRef.sheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-200 underline-offset-2 hover:underline"
                  >
                    {pkg.sheetRef.tab} · row {pkg.sheetRef.row}
                  </a>
                ) : (
                  `${pkg.sheetRef.tab} · row ${pkg.sheetRef.row}`
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Revision</dt>
              <dd className={pkg.revisionCount >= pkg.revisionCap ? "font-semibold text-amber-200" : "text-ink-200"}>
                {pkg.revisionCount}/{pkg.revisionCap}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Cost (est. / actual)</dt>
              <dd className="text-ink-200">
                {formatGbp(pkg.costEstimateGbp)} / {formatGbp(pkg.costActualGbp)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Schedule (UK)</dt>
              <dd className="text-ink-200">
                {scheduleTimes.length ? scheduleTimes.map((t) => <span key={t} className="block">{formatLondon(t)}</span>) : "—"}
              </dd>
            </div>
          </dl>
          {pkg.credibility?.notes && (
            <p className="text-xs text-ink-400">Credibility notes: {pkg.credibility.notes}</p>
          )}
        </header>

        <PendingBanner pkg={pkg} now={now} retrying={retrying} onRetry={() => onRetry(pkg)} />
        <HeldBanner
          pkg={pkg}
          busy={busy}
          onConfirm={() =>
            void onAction(pkg, { action: "confirm_tone", revision: pkg.revision, toneChecked: true })
          }
        />
        <ErrorBanner pkg={pkg} />
        <HeldReleaseBanner pkg={pkg} />
        <HeldTitleBanner pkg={pkg} />
        <PrivateUploadPanel
          pkg={pkg}
          busy={busy}
          onStale={(platform) => void onAction(pkg, { action: "mark_stale", revision: pkg.revision, platform })}
        />
        <ManualPanel
          pkg={pkg}
          busy={busy}
          onDone={(platform) => void onAction(pkg, { action: "mark_manual_done", revision: pkg.revision, platform })}
        />
        <QaFlagsPanel pkg={pkg} />
        <PlatformStatusStrip pkg={pkg} />

        <PlatformTabs
          platforms={pkg.platforms}
          pkgStatus={pkg.status}
          onCopied={onCopied}
          youtube={{
            script: pkg.script,
            coverImageUrl: pkg.coverImageUrl,
            storedTitle,
            rowDecided: ytDecided,
            heldTitle: Boolean(ytRow && platformStatus(pkg, ytRow) === "held_title") && !pa,
            pickBusy: busy,
            onPickTitle: (titleIndex) =>
              void onAction(pkg, { action: "pick_title", revision: pkg.revision, platform: "youtube", titleIndex }),
            selectedTitle,
            onSelectTitle: setSelectedTitle,
            editable: actionable && !busy && Boolean(ytRow && platformStatus(pkg, ytRow) === "review"),
          }}
        />
        <ScriptPanel script={pkg.script} />

        {actionable || (busy && optimisticStatus) ? (
          <ActionPanel
            pkg={pkg}
            pending={busy}
            selectedTitle={titleOptions.length ? selectedTitle : null}
            onAction={(req) => onAction(pkg, req)}
          />
        ) : null}

        {pkg.history.length > 0 && (
          <details className="text-xs text-ink-400">
            <summary className="cursor-pointer hover:text-ink-200">History ({pkg.history.length})</summary>
            <ul className="mt-2 space-y-1">
              {pkg.history.map((h, i) => (
                <li key={i}>
                  <span className="text-ink-300">r{h.revision}</span> · {h.action ?? "update"}
                  {h.stages.length ? ` · ${h.stages.join(", ")}` : ""}
                  {h.platforms?.length ? ` · ${h.platforms.join(", ")}` : ""}
                  {h.feedback ? ` — “${h.feedback}”` : ""} <span className="text-ink-500">({formatLondon(h.at)})</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </article>
  );
}
