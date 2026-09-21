import type { AgentStatus, CodexStatus, TaskStatus } from "@/types";

const agentStyles: Record<AgentStatus, string> = {
  idle: "bg-slate-500/20 text-slate-300 ring-slate-500/30",
  working: "bg-teal-500/15 text-teal-300 ring-teal-400/40",
  blocked: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
  review: "bg-violet-500/15 text-violet-300 ring-violet-400/40",
};

const taskStyles: Record<TaskStatus, string> = {
  backlog: "bg-slate-500/20 text-slate-300 ring-slate-500/30",
  in_progress: "bg-teal-500/15 text-teal-300 ring-teal-400/40",
  review: "bg-violet-500/15 text-violet-300 ring-violet-400/40",
  done: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
};

const codexStyles: Record<CodexStatus, string> = {
  submitted: "bg-slate-500/20 text-slate-300 ring-slate-500/30",
  in_review: "bg-violet-500/15 text-violet-300 ring-violet-400/40",
  published: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
  rejected: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
};

const agentLabels: Record<AgentStatus, string> = {
  idle: "Idle",
  working: "Working",
  blocked: "Blocked",
  review: "Review",
};

const taskLabels: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

const codexLabels: Record<CodexStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  published: "Published",
  rejected: "Rejected",
};

export function AgentStatusChip({ status }: { status: AgentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${agentStyles[status]}`}
    >
      {agentLabels[status]}
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
