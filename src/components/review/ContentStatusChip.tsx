import type { CredibilityLabel, PlatformStatus } from "@/lib/content-review-types";

const statusStyles: Record<PlatformStatus, string> = {
  review: "bg-violet-500/15 text-violet-300 ring-violet-400/40",
  revising: "bg-amber-500/15 text-amber-200 ring-amber-400/40",
  approved: "bg-teal-500/15 text-teal-300 ring-teal-400/40",
  scheduled: "bg-sky-500/15 text-sky-200 ring-sky-400/40",
  posted: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
  failed: "bg-rose-600/25 text-rose-200 ring-rose-500/50",
  rejected: "bg-slate-600/25 text-slate-300 ring-slate-500/40",
  blocked: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
  skipped: "bg-slate-500/15 text-slate-400 ring-slate-500/30",
};

const statusLabels: Record<PlatformStatus, string> = {
  review: "Review",
  revising: "Revising",
  approved: "Approved",
  scheduled: "Scheduled",
  posted: "Posted",
  failed: "Failed",
  rejected: "Killed",
  blocked: "Blocked",
  skipped: "Not approved",
};

export function ContentStatusChip({ status }: { status: PlatformStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusStyles[status] ?? statusStyles.review}`}
    >
      {statusLabels[status] ?? status}
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
      className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider ring-1 ${credStyles[label] ?? credStyles.FOLKLORE}`}
      title="Credibility label (Verity)"
    >
      {label}
    </span>
  );
}

export function SensitiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold tracking-wider text-rose-100 ring-1 ring-rose-400/50">
      <span aria-hidden>⚠</span> SENSITIVE
    </span>
  );
}

export function AiIllustrationTag() {
  return (
    <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-medium text-ink-200 ring-1 ring-white/10">
      AI-generated illustration
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
