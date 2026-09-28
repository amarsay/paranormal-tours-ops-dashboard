"use client";

import type { ContentPackage, ContentStatus, ReviewActionRequest } from "@/lib/content-review-types";
import { formatGbp, formatLondon } from "@/lib/content-review-rules";
import { ActionPanel } from "./ActionPanel";
import {
  AiIllustrationTag,
  ContentStatusChip,
  CredibilityChip,
  ExampleTag,
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
      {v?.poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
      )}
      <div className="relative px-4 text-center">
        <p className="text-sm font-medium text-ink-200">No preview in mock</p>
        <p className="mt-1 text-xs text-ink-500">
          {v?.poster ? "Poster only — the render URL arrives with the real package." : "No render attached yet."}
        </p>
      </div>
    </div>
  );
}

export function ReviewCard({
  pkg,
  pending,
  optimisticStatus,
  onAction,
  onCopied,
}: {
  pkg: ContentPackage;
  pending: boolean;
  optimisticStatus?: ContentStatus;
  onAction: (pkg: ContentPackage, req: ReviewActionRequest) => Promise<boolean>;
  onCopied: (ok: boolean) => void;
}) {
  const scheduleTimes = Array.from(
    new Set(pkg.platforms.map((p) => p.scheduleAt).filter((x): x is string => Boolean(x)))
  ).sort();

  return (
    <article
      className={`card grid gap-4 p-4 sm:p-5 lg:grid-cols-[260px,1fr] ${
        pkg.sensitive ? "border-rose-400/25" : ""
      } ${pending ? "opacity-80" : ""}`}
      aria-labelledby={`subject-${pkg.contentId}`}
      aria-busy={pending}
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
            <ContentStatusChip status={optimisticStatus ?? pkg.status} />
            {pending && <span className="text-xs text-ink-400">Saving…</span>}
            <CredibilityChip label={pkg.credibilityLabel} />
            {pkg.aiIllustration && <AiIllustrationTag />}
            {pkg.sensitive && <SensitiveBadge />}
            {pkg.example && <ExampleTag />}
          </div>
          <h3 id={`subject-${pkg.contentId}`} className="text-lg font-semibold leading-snug text-ink-50">
            {pkg.subject}
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-ink-500">Source</dt>
              <dd className="text-ink-200">
                {pkg.source.sheetUrl ? (
                  <a
                    href={pkg.source.sheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-200 underline-offset-2 hover:underline"
                  >
                    {pkg.source.tab} · row {pkg.source.row}
                  </a>
                ) : (
                  `${pkg.source.tab} · row ${pkg.source.row}`
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

        <PlatformTabs platforms={pkg.platforms} onCopied={onCopied} />
        <ScriptPanel script={pkg.script} />

        {pkg.status === "review" || pending ? (
          <ActionPanel pkg={pkg} pending={pending} onAction={(req) => onAction(pkg, req)} />
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
