import type { AgentOpsHeartbeatBody, AgentOpsRow } from "./live-types";
import {
  normaliseAgentStatus,
  normaliseTaskState,
} from "./live-types";
import { resolveRosterAgent, type RosterAgentRef } from "./roster-resolve";
import { upsertAgentRow } from "./live-store";

export type ApplyResult =
  | { ok: true; row: AgentOpsRow }
  | { ok: false; status: 400 | 404; error: string };

export function resolveHeartbeatAgent(
  body: AgentOpsHeartbeatBody
): RosterAgentRef | null {
  return resolveRosterAgent({
    agentId: body.agentId,
    agentName: body.agentName || body.name,
    name: body.name,
    slug: body.slug,
  });
}

/**
 * Full row for a heartbeat — fields the body omits get their defaults
 * (idle / null). This is the long-standing plain-heartbeat semantics.
 */
export function buildHeartbeatRow(
  body: AgentOpsHeartbeatBody,
  resolved: RosterAgentRef,
  now: string = new Date().toISOString()
): AgentOpsRow {
  const presenceRaw = body.presence ?? body.status;
  const status = normaliseAgentStatus(presenceRaw ?? body.status ?? "idle");
  const taskState =
    normaliseTaskState(body.taskState ?? body.taskStatus) ?? undefined;
  const heartbeatAt = body.heartbeatAt || body.updatedAt || body.at || now;
  const updatedAt = body.updatedAt || body.at || heartbeatAt || now;
  const taskTitle =
    body.taskTitle !== undefined
      ? body.taskTitle
      : body.currentTask !== undefined
        ? body.currentTask
        : null;

  // Agent chips key off write status (idle|working|blocked|review).
  // Keep done/failed on taskState; only honor explicit presence overlays
  // (stale/offline) or explicit done/failed when the write status is idle.
  let presence: string | undefined;
  const p = String(presenceRaw ?? "").toLowerCase();
  if (p === "stale" || p === "offline") {
    presence = p;
  } else if (
    (p === "done" || p === "failed") &&
    status !== "working" &&
    status !== "blocked" &&
    status !== "review"
  ) {
    // Explicit done/failed presence with idle write status (brief pulse).
    // Do NOT promote taskState done/failed into presence — that made Idle
    // agents show as Done whenever taskState stayed done across heartbeats.
    presence = p;
  }

  return {
    agentId: resolved.id,
    agentName: resolved.name,
    status,
    taskTitle: taskTitle ?? null,
    notes: body.notes ?? body.message ?? null,
    correlationId: body.correlationId ?? null,
    handoffTo: body.handoffTo ?? null,
    updatedAt,
    blockerReason: body.blockerReason ?? null,
    taskState: taskState ?? null,
    heartbeatAt,
    taskId: body.taskId ?? null,
    presence: presence ?? status,
    message: body.message ?? null,
  };
}

/**
 * Partial update for POSTs that carry a blocker action: only the row fields
 * backed by heartbeat fields actually present in the body (computed exactly as
 * buildHeartbeatRow would), plus identity and the heartbeat/updated
 * timestamps (the POST is a sign of life). Everything else on the stored row
 * is left as is.
 */
export function buildHeartbeatPatch(
  body: AgentOpsHeartbeatBody,
  resolved: RosterAgentRef,
  now: string = new Date().toISOString()
): Partial<AgentOpsRow> {
  const full = buildHeartbeatRow(body, resolved, now);
  const has = (k: keyof AgentOpsHeartbeatBody) =>
    Object.prototype.hasOwnProperty.call(body, k);
  const patch: Partial<AgentOpsRow> = {
    agentId: full.agentId,
    agentName: full.agentName,
    heartbeatAt: full.heartbeatAt,
    updatedAt: full.updatedAt,
  };
  if (has("status") || has("presence")) {
    patch.status = full.status;
    patch.presence = full.presence;
  }
  if (has("taskTitle") || has("currentTask")) patch.taskTitle = full.taskTitle;
  if (has("notes") || has("message")) patch.notes = full.notes;
  if (has("message")) patch.message = full.message;
  if (has("taskState") || has("taskStatus")) patch.taskState = full.taskState;
  if (has("correlationId")) patch.correlationId = full.correlationId;
  if (has("handoffTo")) patch.handoffTo = full.handoffTo;
  if (has("blockerReason")) patch.blockerReason = full.blockerReason;
  if (has("taskId")) patch.taskId = full.taskId;
  return patch;
}

/** Plain heartbeat: full-row replace (unchanged semantics). */
export async function applyHeartbeat(
  body: AgentOpsHeartbeatBody
): Promise<ApplyResult> {
  const resolved = resolveHeartbeatAgent(body);
  if (!resolved) {
    return { ok: false, status: 404, error: "Unknown agent" };
  }
  const row = buildHeartbeatRow(body, resolved);
  await upsertAgentRow(row);
  return { ok: true, row };
}
