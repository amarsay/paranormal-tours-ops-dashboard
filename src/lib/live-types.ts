import type { AgentStatus, PresenceStatus, TaskStatus } from "@/types";

export const LIVE_SCHEMA_VERSION = 1;

/** Spectre / agent-ops status row (current-state only) */
export interface AgentOpsRow {
  agentId: string;
  agentName: string;
  status: AgentStatus;
  taskTitle: string | null;
  notes?: string | null;
  correlationId?: string | null;
  handoffTo?: string | null;
  updatedAt: string;
  /** Flo / Spectre optional extras */
  blockerReason?: string | null;
  taskState?: TaskStatus | string | null;
  heartbeatAt?: string | null;
  taskId?: string | null;
  presence?: PresenceStatus | string | null;
  message?: string | null;
}

export interface AgentOpsSnapshot {
  schemaVersion: number;
  updatedAt: string;
  agents: Record<string, AgentOpsRow>;
  storage: "redis" | "memory";
}

/** POST body — Spectre + flexible identity */
export interface AgentOpsHeartbeatBody {
  agentId?: string;
  agentName?: string;
  name?: string;
  slug?: string;
  status?: string;
  presence?: string;
  taskTitle?: string | null;
  currentTask?: string | null;
  notes?: string | null;
  correlationId?: string | null;
  handoffTo?: string | null;
  updatedAt?: string;
  blockerReason?: string | null;
  taskState?: string | null;
  taskStatus?: string | null;
  heartbeatAt?: string | null;
  taskId?: string | null;
  message?: string | null;
  at?: string;
}

export const PRIMARY_STATUSES: AgentStatus[] = [
  "idle",
  "working",
  "blocked",
  "review",
];

export function normaliseAgentStatus(raw: unknown): AgentStatus {
  const s = String(raw ?? "")
    .toLowerCase()
    .trim();
  if (s === "working" || s === "in_progress" || s === "busy") return "working";
  if (s === "blocked") return "blocked";
  if (s === "review" || s === "in_review") return "review";
  if (s === "done" || s === "completed") return "idle"; // primary chip after done pulse handled client-side
  if (s === "failed") return "blocked";
  if (s === "idle" || s === "queued" || s === "backlog") return "idle";
  if ((PRIMARY_STATUSES as string[]).includes(s)) return s as AgentStatus;
  return "idle";
}

export function normaliseTaskState(raw: unknown): TaskStatus | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).toLowerCase().trim();
  if (s === "queued" || s === "backlog") return "backlog";
  if (s === "working" || s === "in_progress" || s === "in-progress")
    return "in_progress";
  if (s === "blocked") return "blocked";
  if (s === "review" || s === "in_review") return "review";
  if (s === "done" || s === "completed") return "done";
  if (s === "failed") return "failed";
  return null;
}

/** Freshness thresholds (Flo) */
export const FRESHNESS = {
  liveActiveMs: 30_000,
  liveIdleMs: 120_000,
  staleActiveMs: 90_000,
  staleIdleMs: 300_000,
  donePulseMs: 60_000,
} as const;
