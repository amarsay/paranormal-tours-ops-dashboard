"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { ContentScript, ContentStatus, PlatformCopy, PlatformStatus } from "@/lib/content-review-types";
import { PLATFORM_LABELS } from "@/lib/content-review-types";
import {
  DEFAULT_CHAR_LIMITS,
  YOUTUBE_DESCRIPTION_LIMIT,
  YOUTUBE_TITLE_LIMIT,
  charCount,
  composedCopy,
  formatLondon,
  platformStatus,
} from "@/lib/content-review-rules";
import { ContentStatusChip, STATUS_LABELS } from "./ContentStatusChip";

const TAB_DOT: Partial<Record<PlatformStatus, string>> = {
  approved: "bg-teal-400",
  scheduled: "bg-sky-400",
  posted: "bg-emerald-400",
  held_tone: "bg-amber-400",
  held_title: "bg-amber-400",
  awaiting_manual: "bg-blue-400",
  posted_manual: "bg-emerald-400",
  held_release: "bg-amber-400",
  out_of_date: "bg-slate-500",
  published_private: "bg-slate-400",
  not_approved: "bg-slate-500",
  killed: "bg-slate-500",
  failed: "bg-rose-500",
};
import { CopyButton } from "./CopyButton";

const SHORT: Record<string, string> = {
  facebook: "FB",
  instagram: "IG",
  threads: "Threads",
  bluesky: "Bluesky",
  youtube: "YouTube",
  tiktok: "TikTok",
  lemon8: "Lemon8",
  website: "Website",
};

function isOver(p: PlatformCopy): boolean {
  if (p.platform === "youtube") {
    return (
      charCount(p.title) > YOUTUBE_TITLE_LIMIT ||
      charCount(p.description) > (p.charLimit ?? YOUTUBE_DESCRIPTION_LIMIT)
    );
  }
  if (p.platform === "website") return false;
  const limit = p.charLimit ?? DEFAULT_CHAR_LIMITS[p.platform];
  return limit ? charCount(composedCopy(p)) > limit : false;
}

function Counter({ used, limit, label }: { used: number; limit?: number; label: string }) {
  const over = limit !== undefined && used > limit;
  return (
    <p
      className={`text-xs tabular-nums ${over ? "font-semibold text-rose-300" : "text-ink-400"}`}
      aria-label={`${label}: ${used}${limit ? ` of ${limit}` : ""} characters${over ? ", over the limit" : ""}`}
    >
      {used}
      {limit ? ` / ${limit}` : ""} {over && "· over limit"}
    </p>
  );
}

function Hashtags({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span key={t} className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs text-violet-200 ring-1 ring-violet-400/20">
          {t.startsWith("#") ? t : `#${t}`}
        </span>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{label}</p>
      {children}
    </div>
  );
}

export interface YoutubeChoice {
  script: ContentScript;
  coverImageUrl?: string | null;
  /** Stored (sheet) value on the youtube row; null after approval = default option 1. */
  storedTitle?: string | null;
  rowDecided: boolean;
  /** youtube row is held_title: radios stay live and "Use this title" sends pick_title. */
  heldTitle?: boolean;
  onPickTitle?: (titleIndex: number) => void;
  pickBusy?: boolean;
  selectedTitle: string | null;
  onSelectTitle: (t: string) => void;
  /** Row still in review → founder can pick; otherwise read-only. */
  editable: boolean;
}

/** coverFrameScene is 1-based; the frame is grabbed 0.5 s after that scene starts. */
function coverFrameLabel(script: ContentScript, n: number): string {
  const scene = script.scenes.find((s) => s.index === n) ?? script.scenes[n - 1];
  const desc = scene?.visual || scene?.text;
  return `Scene ${n}${desc ? ` — ${desc}` : ""}`;
}

function YoutubeScriptExtras({ yt, name }: { yt: YoutubeChoice; name: string }) {
  const options = (yt.script.youtubeTitleOptions ?? []).filter((t) => t.trim());
  const { hookOverlay, openQuestion, coverFrameScene } = yt.script;
  const hasExtras = Boolean(hookOverlay || openQuestion || coverFrameScene !== undefined);
  const pickable = !yt.rowDecided || Boolean(yt.heldTitle);
  if (!options.length && !hasExtras && !yt.coverImageUrl) return null;
  const showDefault = yt.rowDecided && !yt.storedTitle && options.length > 0;
  return (
    <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
      {yt.coverImageUrl && (
        <figure className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={yt.coverImageUrl}
            alt="Cover image (YouTube thumbnail)"
            className="aspect-video w-full max-w-[280px] rounded-lg bg-black object-cover ring-1 ring-white/10"
            loading="lazy"
          />
          <figcaption className="text-[11px] text-ink-500">Cover image</figcaption>
        </figure>
      )}
      {yt.rowDecided && options.length > 0 && (
        <p className="text-sm text-ink-100">
          <span className="text-ink-500">Title: </span>
          {showDefault ? (
            <>
              option 1 (default) <span className="text-ink-400">— {options[0]}</span>
            </>
          ) : (
            yt.storedTitle
          )}
        </p>
      )}
      {options.length > 0 && pickable && (
        <fieldset className="space-y-1.5" disabled={!yt.editable && !yt.heldTitle}>
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            Title options{" "}
            <span className="normal-case tracking-normal text-ink-400">
              {yt.heldTitle ? "(pick one, then Use this title)" : "(pick one — sent with Approve)"}
            </span>
          </legend>
          {options.map((t) => (
            <label key={t} className="flex items-start gap-2 text-sm text-ink-100">
              <input
                type="radio"
                name={name}
                className="mt-1 h-4 w-4 accent-violet-500"
                checked={yt.selectedTitle === t}
                onChange={() => yt.onSelectTitle(t)}
              />
              <span>
                {t}{" "}
                <span className={`text-xs tabular-nums ${charCount(t) > YOUTUBE_TITLE_LIMIT ? "text-rose-300" : "text-ink-500"}`}>
                  ({charCount(t)}/{YOUTUBE_TITLE_LIMIT})
                </span>
              </span>
            </label>
          ))}
          {!yt.selectedTitle && yt.editable && !yt.heldTitle && (
            <p className="text-xs text-amber-200/90">No title picked yet — needed to approve YouTube.</p>
          )}
          {yt.heldTitle && yt.onPickTitle && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                className="rounded-lg bg-amber-500/25 px-3 py-1.5 text-xs font-medium text-amber-50 ring-1 ring-amber-400/50 transition hover:bg-amber-500/35 disabled:opacity-40"
                disabled={!yt.selectedTitle || yt.pickBusy}
                onClick={() => {
                  const i = options.indexOf(yt.selectedTitle ?? "");
                  if (i >= 0) yt.onPickTitle?.(i);
                }}
              >
                Use this title
              </button>
              <span className="text-xs text-ink-400">
                {yt.selectedTitle ? "Replaces the held hand-typed title." : "Pick one of the generated options first."}
              </span>
            </div>
          )}
        </fieldset>
      )}
      {hasExtras && (
        <dl className="grid gap-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-ink-500">Hook overlay</dt>
            <dd className="text-ink-200">{hookOverlay || "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Open question</dt>
            <dd className="text-ink-200">{openQuestion || "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Cover frame</dt>
            <dd className="text-ink-200">
              {coverFrameScene === undefined ? "—" : coverFrameLabel(yt.script, coverFrameScene)}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function PanelBody({
  p,
  onCopied,
  yt,
  radioName,
}: {
  p: PlatformCopy;
  onCopied: (ok: boolean) => void;
  yt?: YoutubeChoice;
  radioName: string;
}) {
  const schedule = (
    <p className="text-xs text-ink-400">
      Scheduled: <span className="text-ink-200">{formatLondon(p.scheduleAt)}</span>
      {p.scheduleAt && " (UK time)"}
    </p>
  );

  if (p.platform === "youtube") {
    return (
      <div className="space-y-3">
        {yt && <YoutubeScriptExtras yt={yt} name={radioName} />}
        <Field label={yt?.script.youtubeTitleOptions?.length ? "Current title" : "Title"}>
          <p className="text-sm font-medium text-ink-50">{p.title || "—"}</p>
          <Counter used={charCount(p.title)} limit={YOUTUBE_TITLE_LIMIT} label="Title" />
        </Field>
        <Field label="Description">
          <p className="whitespace-pre-wrap text-sm text-ink-200">{p.description || "—"}</p>
          <Counter
            used={charCount(p.description)}
            limit={p.charLimit ?? YOUTUBE_DESCRIPTION_LIMIT}
            label="Description"
          />
        </Field>
        {p.tags?.length ? (
          <Field label="Tags">
            <p className="text-xs text-ink-300">{p.tags.join(", ")}</p>
          </Field>
        ) : null}
        <Hashtags tags={p.hashtags} />
        {schedule}
      </div>
    );
  }

  if (p.platform === "website") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-ink-950/60 p-4">
          <p className="text-[11px] uppercase tracking-wider text-teal-300/80">
            {p.category || "Uncategorised"} · paranormaltours.com preview
          </p>
          <h4 className="mt-1 text-lg font-semibold text-ink-50">{p.title || "Untitled"}</h4>
          <p className="mt-1 text-sm italic text-ink-300">{p.excerpt}</p>
          {p.bodyHtml && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-violet-200">Show body HTML (source)</summary>
              {/* Shown as escaped source, never rendered, so package HTML cannot run here. */}
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-[11px] text-ink-300">
                {p.bodyHtml}
              </pre>
            </details>
          )}
        </div>
        {schedule}
      </div>
    );
  }

  const composed = composedCopy(p);
  const limit = p.charLimit ?? DEFAULT_CHAR_LIMITS[p.platform];

  if (p.platform === "lemon8") {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-amber-400/30">
          Manual post: Lemon8 has no posting API. Copy each part below into the app.
        </p>
        {p.title && (
          <Field label="Title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink-50">{p.title}</p>
              <CopyButton text={p.title} label="title" onCopied={onCopied} />
            </div>
          </Field>
        )}
        <Field label="Caption">
          <p className="whitespace-pre-wrap text-sm text-ink-200">{p.text}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Counter used={charCount(composed)} limit={limit} label="Caption with CTA and hashtags" />
            <CopyButton text={p.text ?? ""} label="caption" onCopied={onCopied} />
          </div>
        </Field>
        {p.cta && (
          <Field label="CTA">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink-200">{p.cta}</p>
              <CopyButton text={p.cta} label="CTA" onCopied={onCopied} />
            </div>
          </Field>
        )}
        {p.hashtags?.length ? (
          <Field label="Hashtags">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Hashtags tags={p.hashtags} />
              <CopyButton
                text={p.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                label="hashtags"
                onCopied={onCopied}
              />
            </div>
          </Field>
        ) : null}
        <CopyButton text={composed} label="everything" onCopied={onCopied} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Field label="Copy">
        <p className="whitespace-pre-wrap text-sm text-ink-200">{p.text || "—"}</p>
      </Field>
      {p.cta && (
        <Field label="CTA">
          <p className="text-sm text-teal-100">{p.cta}</p>
        </Field>
      )}
      <Hashtags tags={p.hashtags} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Counter used={charCount(composed)} limit={limit} label="Post length including CTA and hashtags" />
        {schedule}
      </div>
    </div>
  );
}

export function PlatformTabs({
  platforms,
  pkgStatus,
  onCopied,
  youtube,
}: {
  platforms: PlatformCopy[];
  pkgStatus: ContentStatus;
  onCopied: (ok: boolean) => void;
  youtube?: YoutubeChoice;
}) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (platforms.length === 0) {
    return <p className="text-sm text-ink-400">No platform copy in this package.</p>;
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    let next = active;
    if (e.key === "ArrowRight") next = (active + 1) % platforms.length;
    else if (e.key === "ArrowLeft") next = (active - 1 + platforms.length) % platforms.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = platforms.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  const current = platforms[Math.min(active, platforms.length - 1)];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Platform copy"
        className="flex gap-1 overflow-x-auto rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/5"
        onKeyDown={onKey}
      >
        {platforms.map((p, i) => {
          const selected = i === active;
          const over = isOver(p);
          const st = platformStatus({ status: pkgStatus }, p);
          return (
            <button
              key={p.platform}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`${baseId}-tab-${p.platform}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              title={`${PLATFORM_LABELS[p.platform]} · ${STATUS_LABELS[st]}`}
              className={`relative shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                selected
                  ? "bg-violet-500/20 text-violet-100"
                  : "text-ink-300 hover:bg-white/5 hover:text-ink-100"
              }`}
            >
              {TAB_DOT[st] && (
                <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${TAB_DOT[st]}`} aria-hidden />
              )}
              {SHORT[p.platform] ?? p.platform}
              {over && (
                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-400 align-middle" aria-label="over character limit" />
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${current.platform}`}
        tabIndex={0}
        className="mt-3 rounded-xl border border-white/5 bg-ink-950/40 p-3 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-ink-100">{PLATFORM_LABELS[current.platform]}</h4>
          <ContentStatusChip
            status={platformStatus({ status: pkgStatus }, current)}
            at={current.postedAt}
            holdReason={current.holdReason}
          />
        </div>
        <PanelBody
          p={current}
          onCopied={onCopied}
          yt={current.platform === "youtube" ? youtube : undefined}
          radioName={`${baseId}-yt-title`}
        />
      </div>
    </div>
  );
}
