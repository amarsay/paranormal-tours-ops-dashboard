import {
  applyHeartbeat,
  buildHeartbeatPatch,
  buildHeartbeatRow,
  resolveHeartbeatAgent,
} from "./apply-heartbeat";
import type {
  AgentOpsHeartbeatBody,
  AgentOpsRow,
  AgentOpsSnapshot,
} from "./live-types";
import { getSnapshot } from "./live-store";
import {
  PARKED_MAX_PER_AGENT,
  hasHeartbeatFields,
  parseBlockerOp,
} from "./parked-blockers";
import { listParkedBlockers } from "./parked-store";
import { writeStatus } from "./status-write";

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

async function blockersFor(agentId: string) {
  try {
    return (await listParkedBlockers([agentId]))[agentId] ?? [];
  } catch (err) {
    console.error("[agent-ops] parked blockers read failed", err);
    return [];
  }
}

/**
 * POST /api/agent-ops/status after auth + JSON parse.
 *
 * Plain heartbeat (no parkBlocker / clearBlocker): unchanged full-row
 * replace — omitted fields reset to defaults. Response `row` now also carries
 * the agent's `parkedBlockers` (same as the snapshot row).
 *
 * With a blocker action, all validation (400) and agent resolution (404)
 * happen before any write; then ONE atomic store op does, together:
 *  - the blocker action (park cap → 409 blocker_limit), and
 *  - a PARTIAL row update: only the heartbeat fields actually sent are merged
 *    onto the stored row (a blocker-only POST leaves the row untouched).
 * Parking for an agent with no stored row and no heartbeat fields → 409
 * no_live_row (nothing stored). Store errors → 503, nothing applied.
 */
export async function handleStatusPost(
  body: AgentOpsHeartbeatBody
): Promise<StatusPostResult> {
  const parsed = parseBlockerOp(body);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error, code: parsed.code } };
  }
  const { op } = parsed;

  if (op.type === "none") {
    // Unchanged heartbeat path (a client-sent parkedBlockers array is simply
    // not read by applyHeartbeat).
    const result = await applyHeartbeat(body);
    if (!result.ok) {
      return {
        status: result.status,
        body: {
          error: result.error,
          code: result.status === 404 ? "unknown_agent" : "invalid_body",
        },
      };
    }
    const snapshot = await getSnapshotWithBlockers();
    const parkedBlockers =
      snapshot.agents[result.row.agentId]?.parkedBlockers ??
      (await blockersFor(result.row.agentId));
    return {
      status: 200,
      body: { ok: true, row: { ...result.row, parkedBlockers }, snapshot },
    };
  }

  const resolved = resolveHeartbeatAgent(body);
  if (!resolved) {
    return { status: 404, body: { error: "Unknown agent", code: "unknown_agent" } };
  }

  const now = new Date().toISOString();
  const heartbeat = hasHeartbeatFields(body);
  let result: Awaited<ReturnType<typeof writeStatus>>;
  try {
    result = await writeStatus({
      agentId: resolved.id,
      blocker: op,
      row: heartbeat
        ? {
            mode: "merge",
            patch: buildHeartbeatPatch(body, resolved, now),
            createRow: buildHeartbeatRow(body, resolved, now),
          }
        : undefined,
      // A blocker-only park must attach to a live row, or it would be stored
      // but invisible (GET only lists agents that have a row).
      requireRow: op.type === "park" && !heartbeat,
    });
  } catch (err) {
    console.error("[agent-ops] status write failed", err);
    return {
      status: 503,
      body: {
        error: "Status store unavailable — nothing was applied",
        code: "store_unavailable",
      },
    };
  }

  if (!result.ok) {
    const error =
      result.code === "no_live_row"
        ? `${resolved.name} has no live status row yet — send a heartbeat first (or include heartbeat fields in this POST). Nothing was stored.`
        : `${resolved.name} already has ${PARKED_MAX_PER_AGENT} parked blockers — clear one first. Nothing was applied.`;
    return { status: 409, body: { error, code: result.code } };
  }

  // Re-park with a different explicit `since`: the original is kept on
  // purpose (waiting time must not reset) — say so.
  let blocker: Record<string, unknown> | undefined = result.blocker;
  if (result.blocker?.op === "park" && op.type === "park") {
    const sent = op.blocker.since;
    blocker = {
      ...result.blocker,
      sinceKept:
        result.blocker.result === "updated" &&
        sent !== undefined &&
        sent !== result.blocker.blocker.since,
    };
  }

  const snapshot = await getSnapshotWithBlockers();
  const parkedBlockers =
    snapshot.agents[resolved.id]?.parkedBlockers ??
    (await blockersFor(resolved.id));
  return {
    status: 200,
    body: {
      ok: true,
      row: result.row ? { ...result.row, parkedBlockers } : null,
      parkedBlockers,
      blocker,
      snapshot,
    },
  };
}
