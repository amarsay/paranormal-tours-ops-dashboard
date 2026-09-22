import type { AgentOpsHeartbeatBody, AgentOpsRow } from "./live-types";
import {
  normaliseAgentStatus,
  normaliseTaskState,
} from "./live-types";
import { resolveRosterAgent } from "./roster-resolve";
import { upsertAgentRow } from "./live-store";

export type ApplyResult =
  | { ok: true; row: AgentOpsRow }
  | { ok: false; status: 400 | 404; error: string };

export async function applyHeartbeat(
  body: AgentOpsHeartbeatBody
): Promise<ApplyResult> {
  const resolved = resolveRosterAgent({
    agentId: body.agentId,
    agentName: body.agentName || body.name,
    name: body.name,
    slug: body.slug,
  });
  if (!resolved) {
    return { ok: false, status: 404, error: "Unknown agent" };
  }

  const presenceRaw = body.presence ?? body.status;
  const status = normaliseAgentStatus(presenceRaw ?? body.status ?? "idle");
  const taskState =
    normaliseTaskState(body.taskState ?? body.taskStatus) ?? undefined;
  const now = new Date().toISOString();
  const heartbeatAt = body.heartbeatAt || body.updatedAt || body.at || now;
  const updatedAt = body.updatedAt || body.at || heartbeatAt || now;
  const taskTitle =
    body.taskTitle !== undefined
      ? body.taskTitle
      : body.currentTask !== undefined
        ? body.currentTask
        : null;

  // Preserve done/failed in presence field for client derivation
  let presence: string | undefined;
  const p = String(presenceRaw ?? "").toLowerCase();
  if (p === "done" || p === "failed" || p === "stale" || p === "offline") {
    presence = p;
  } else if (taskState === "done") {
    presence = "done";
  } else if (taskState === "failed") {
    presence = "failed";
  }

  const row: AgentOpsRow = {
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

  await upsertAgentRow(row);
  return { ok: true, row };
}
