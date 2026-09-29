import type {
  AgentStatus,
  ParkedBlocker,
  PresenceStatus,
  TaskStatus,
} from "@/types";

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
  /**
   * Parked blockers (GET only). Stored separately from the row (per-agent
   * Redis hash) and merged in on read; legacy rows read as [].
   */
  parkedBlockers?: ParkedBlocker[];
}

/**
 * Every stored row field, in the exact key order the 22 Sep production build
 * wrote (JSON.stringify of buildHeartbeatRow). Used to:
 *  - restore null-valued fields in the Lua write script — Upstash's cjson
 *    decodes JSON null as a *missing* key, so a decode → re-encode would
 *    silently drop them (see status-lua.ts);
 *  - normalise rows on read, so the GET shape (keys and key order) matches
 *    the legacy build even if a stored row lost a field.
 * parkedBlockers is GET-only and never stored, so it is not listed.
 */
export const AGENT_ROW_FIELDS = [
  "agentId",
  "agentName",
  "status",
  "taskTitle",
  "notes",
  "correlationId",
  "handoffTo",
  "updatedAt",
  "blockerReason",
  "taskState",
  "heartbeatAt",
  "taskId",
  "presence",
  "message",
] as const;

/**
 * Stored row → canonical shape: every known field present (missing → null)
 * in legacy order, then any unknown keys in their stored order. Non-object
 * values are returned untouched (never throws on odd data).
 */
export function normaliseStoredRow(raw: unknown): AgentOpsRow {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw as AgentOpsRow;
  }
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of AGENT_ROW_FIELDS) out[f] = src[f] === undefined ? null : src[f];
  for (const [k, v] of Object.entries(src)) {
    if (!(k in out)) out[k] = v;
  }
  return out as unknown as AgentOpsRow;
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
  /** Upsert a parked blocker by id (see src/lib/parked-blockers.ts). */
  parkBlocker?: unknown;
  /** Remove a parked blocker by id (unknown id → no-op 200). */
  clearBlocker?: unknown;
  /** Ignored if sent — the server owns the list. */
  parkedBlockers?: unknown;
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
