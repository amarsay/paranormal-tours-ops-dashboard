import { applyHeartbeat } from "./apply-heartbeat";
import type {
  AgentOpsHeartbeatBody,
  AgentOpsRow,
  AgentOpsSnapshot,
} from "./live-types";
import { getSnapshot } from "./live-store";
import { hasHeartbeatFields, parseBlockerOp } from "./parked-blockers";
import { clearBlocker, listParkedBlockers, parkBlocker } from "./parked-store";
import { resolveRosterAgent } from "./roster-resolve";

/**
 * Snapshot for GET /api/agent-ops/status: the stored rows plus
 * `parkedBlockers` merged per row (legacy rows / no blockers → []).
 * If the blocker read fails the rows still come back, each with [].
 */
export async function getSnapshotWithBlockers(): Promise<AgentOpsSnapshot> {
  const snap = await getSnapshot();
  const ids = Object.keys(snap.agents);
  let parked: Record<string, AgentOpsRow["parkedBlockers"]> = {};
  try {
    parked = await listParkedBlockers(ids);
  } catch (err) {
    console.error("[agent-ops] parked blockers read failed", err);
  }
  const agents: Record<string, AgentOpsRow> = {};
  for (const id of ids) {
    agents[id] = { ...snap.agents[id]!, parkedBlockers: parked[id] ?? [] };
  }
  return { ...snap, agents };
}

export type StatusPostResult = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * POST /api/agent-ops/status after auth + JSON parse.
 *
 * Legacy bodies (no parkBlocker / clearBlocker) take exactly the old path:
 * applyHeartbeat → { ok, row, snapshot }.
 *
 * With a blocker op, everything that can fail is checked before anything is
 * written: blocker validation (400), agent resolution (404), then the single
 * atomic blocker op (409 cap / 503 store error). Only after that succeeds is
 * the heartbeat (if the body has heartbeat fields) applied. A blocker-only
 * POST leaves the live status/task row untouched.
 */
export async function handleStatusPost(
  body: AgentOpsHeartbeatBody
): Promise<StatusPostResult> {
  const parsed = parseBlockerOp(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const { op } = parsed;

  if (op.type === "none") {
    // Unchanged heartbeat path (a client-sent parkedBlockers array is simply
    // not read by applyHeartbeat).
    const result = await applyHeartbeat(body);
    if (!result.ok) {
      return { status: result.status, body: { error: result.error } };
    }
    const snapshot = await getSnapshotWithBlockers();
    return { status: 200, body: { ok: true, row: result.row, snapshot } };
  }

  const resolved = resolveRosterAgent({
    agentId: body.agentId,
    agentName: body.agentName || body.name,
    name: body.name,
    slug: body.slug,
  });
  if (!resolved) return { status: 404, body: { error: "Unknown agent" } };

  let blockerResult: Record<string, unknown>;
  try {
    if (op.type === "park") {
      const res = await parkBlocker(resolved.id, op.blocker);
      if (!res.ok) return { status: res.status, body: { error: res.error } };
      blockerResult = { op: "park", result: res.result, blocker: res.blocker };
    } else {
      const removed = await clearBlocker(resolved.id, op.id);
      blockerResult = { op: "clear", id: op.id, removed };
    }
  } catch (err) {
    console.error("[agent-ops] parked blocker write failed", err);
    return {
      status: 503,
      body: { error: "Parked blocker store unavailable — nothing was applied" },
    };
  }

  let row: AgentOpsRow | null = null;
  if (hasHeartbeatFields(body)) {
    const result = await applyHeartbeat(body);
    // Agent already resolved above, so applyHeartbeat can't 404 here.
    if (result.ok) row = result.row;
  }

  const snapshot = await getSnapshotWithBlockers();
  const current = snapshot.agents[resolved.id];
  const parkedBlockers =
    current?.parkedBlockers ??
    (await listParkedBlockers([resolved.id]))[resolved.id] ??
    [];
  return {
    status: 200,
    body: {
      ok: true,
      row: row ? { ...row, parkedBlockers } : (current ?? null),
      parkedBlockers,
      blocker: blockerResult,
      snapshot,
    },
  };
}
