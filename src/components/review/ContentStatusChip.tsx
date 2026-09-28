import type { ContentStatus, CredibilityLabel, HoldReason, PlatformStatus } from "@/lib/content-review-types";

type AnyStatus = ContentStatus | PlatformStatus;

const statusStyles: Record<AnyStatus, string> = {
  review: "bg-violet-500/15 text-violet-300 ring-violet-400/40",
  revising: "bg-amber-500/15 text-amber-200 ring-amber-400/40",
  approved: "bg-teal-500/15 text-teal-300 ring-teal-400/40",
  scheduled: "bg-sky-500/15 text-sky-200 ring-sky-400/40",
  posted: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
  failed: "bg-rose-600/25 text-rose-200 ring-rose-500/50",
  killed: "bg-slate-600/25 text-slate-300 ring-slate-500/40",
  blocked: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
  not_approved: "bg-slate-500/15 text-slate-400 ring-slate-500/30",
  held_tone: "bg-amber-500/20 text-amber-100 ring-amber-400/60",
  held_title: "bg-amber-500/20 text-amber-100 ring-amber-400/60",
  awaiting_manual: "bg-blue-500/20 text-blue-100 ring-blue-400/50",
  posted_manual: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
  published_private: "bg-slate-500/20 text-slate-300 ring-slate-400/40",
  held_release: "bg-amber-500/20 text-amber-100 ring-amber-400/60",
  out_of_date: "bg-slate-600/25 text-slate-400 ring-slate-500/40",
};

export const STATUS_LABELS: Record<AnyStatus, string> = {
  review: "Review",
  revising: "Revising",
  approved: "Approved",
  scheduled: "Scheduled",
  posted: "Posted",
  failed: "Failed",
  killed: "Killed",
  blocked: "Blocked",
  not_approved: "Not approved",
  held_tone: "Held: tone check missing",
  held_title: "Held: title failed check",
  awaiting_manual: "Finish in app",
  posted_manual: "Posted by hand",
  // Never shown as live: private upload while the Google API audit is pending.
  published_private: "Uploaded private (audit pending)",
  held_release: "Held at release",
  out_of_date: "Out of date — won't release",
};

export const HOLD_REASON_LABELS: Record<HoldReason, string> = {
  codex_status: "Held at release: Codex status changed",
  banned_phrase: "Held at release: banned phrase",
  tone: "Held at release: tone check",
};

/** In-flight label (real mode pending, e.g. "Approving…"). */
export function PendingChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-100 ring-1 ring-violet-400/40">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-300" aria-hidden />
      {label}
    </span>
  );
}

const statusLabels = STATUS_LABELS;

/** Short UK time for chip suffixes (e.g. "Posted by hand · Tue 19:04"). */
function chipTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function ContentStatusChip({
  status,
  at,
  holdReason,
}: {
  status: AnyStatus;
  at?: string | null;
  holdReason?: HoldReason | null;
}) {
  const t = status === "posted_manual" ? chipTime(at) : null;
  const label =
    status === "held_release" && holdReason ? HOLD_REASON_LABELS[holdReason] : statusLabels[status] ?? status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusStyles[status] ?? statusStyles.review}`}
    >
      {label}
      {t ? ` · ${t}` : ""}
    </span>
  );
}

const credStyles: Record<CredibilityLabel, string> = {
  DOCUMENTED: "bg-emerald-500/10 text-emerald-200 ring-emerald-400/30",
  REPORTED: "bg-sky-500/10 text-sky-200 ring-sky-400/30",
  TESTIMONY: "bg-amber-500/10 text-amber-200 ring-amber-400/30",
  FOLKLORE: "bg-fuchsia-500/10 text-fuchsia-200 ring-fuchsia-400/30",
};

export function CredibilityChip({ label }: { label: CredibilityLabel }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border-l-2 border-l-[#C878F0] px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider ring-1 ${credStyles[label] ?? credStyles.FOLKLORE}`}
      title="Credibility label (Verity)"
    >
      {label}
    </span>
  );
}

export function SensitiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border-l-2 border-l-[#C878F0] bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold tracking-wider text-rose-100 ring-1 ring-rose-400/50">
      <span aria-hidden>⚠</span> SENSITIVE
    </span>
  );
}

export function AiIllustrationTag() {
  return (
    <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-medium text-ink-200 ring-1 ring-white/10">
      AI-generated visuals and voice
    </span>
  );
}

export function ExampleTag() {
  return (
    <span className="inline-flex items-center rounded-md bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200 ring-1 ring-amber-400/40">
      Example data
    </span>
  );
}

export function QaFlaggedChip({ count }: { count: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold tracking-wider text-amber-100 ring-1 ring-amber-400/50"
      title={`${count} automatic QA check(s) failed`}
    >
      QA flagged
    </span>
  );
}

export function PromoChip() {
  return (
    <span className="inline-flex items-center rounded-md bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-sky-100 ring-1 ring-sky-400/40">
      Promo · manual approval only
    </span>
  );
}

export function UnknownProviderChip({ value }: { value: string }) {
  return (
    <span
      className="inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100 ring-1 ring-amber-400/40"
      title={`Provider value not recognised: ${value}`}
    >
      Unknown provider
    </span>
  );
}
