import type { PresenceStatus, CodexStatus, TaskStatus } from "@/types";

const presenceStyles: Record<PresenceStatus, string> = {
  idle: "bg-slate-500/20 text-slate-300 ring-slate-500/30",
  working: "bg-teal-500/15 text-teal-300 ring-teal-400/40",
  blocked: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
  review: "bg-violet-500/15 text-violet-300 ring-violet-400/40",
  done: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
  failed: "bg-rose-600/25 text-rose-200 ring-rose-500/50",
  stale: "bg-amber-500/15 text-amber-200 ring-amber-400/40",
  offline: "bg-slate-600/25 text-slate-400 ring-slate-500/30",
};

const taskStyles: Record<TaskStatus, string> = {
  backlog: "bg-slate-500/20 text-slate-300 ring-slate-500/30",
  in_progress: "bg-teal-500/15 text-teal-300 ring-teal-400/40",
  blocked: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
  review: "bg-violet-500/15 text-violet-300 ring-violet-400/40",
  done: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
  failed: "bg-rose-600/25 text-rose-200 ring-rose-500/50",
};

const codexStyles: Record<CodexStatus, string> = {
  submitted: "bg-slate-500/20 text-slate-300 ring-slate-500/30",
  in_review: "bg-violet-500/15 text-violet-300 ring-violet-400/40",
  published: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
  rejected: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
};

const presenceLabels: Record<PresenceStatus, string> = {
  idle: "Idle",
  working: "Working",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
  failed: "Failed",
  stale: "Stale",
  offline: "Offline",
};

const taskLabels: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
  failed: "Failed",
};

const codexLabels: Record<CodexStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  published: "Published",
  rejected: "Rejected",
};

export function AgentStatusChip({ status }: { status: PresenceStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${presenceStyles[status] ?? presenceStyles.idle}`}
    >
      {presenceLabels[status] ?? status}
    </span>
  );
}

export function TaskStatusChip({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${taskStyles[status]}`}
    >
      {taskLabels[status]}
    </span>
  );
}

export function CodexStatusChip({ status }: { status: CodexStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${codexStyles[status]}`}
    >
      {codexLabels[status]}
    </span>
  );
}

export function LiveDot({ live }: { live: boolean }) {
  if (!live) return null;
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.8)]"
      title="Live heartbeat"
      aria-label="Live"
    />
  );
}
