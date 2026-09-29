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
import {
  StoreUnavailableError,
  getSnapshot,
  redisPipeline,
  snapshotFromRaw,
  storageMode,
} from "./live-store";
import { parkedIndexKey, statusRedisKey } from "./status-lua";
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
 *
 * Redis: ONE pipeline round trip — GET status + SMEMBERS parked index
 * (2 commands) — then HGETALL only for agents that have blockers. Any store
 * error throws StoreUnavailableError (→ 503): no memory fallback and no
 * silent [] for blockers, so a response is always one consistent store.
 */
export async function getSnapshotWithBlockers(): Promise<AgentOpsSnapshot> {
  let snap: AgentOpsSnapshot;
  let indexMembers: string[] | undefined;
  if (storageMode() === "redis") {
    const [raw, members] = await redisPipeline([
      ["GET", statusRedisKey()],
      ["SMEMBERS", parkedIndexKey()],
    ]);
    snap = snapshotFromRaw(raw);
    indexMembers = Array.isArray(members) ? (members as string[]) : [];
  } else {
    snap = await getSnapshot();
  }
  const ids = Object.keys(snap.agents);
  const parked = await listParkedBlockers(ids, indexMembers);
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

export const STORE_UNAVAILABLE_BODY = {
  error: "Status store unavailable — nothing was applied",
  code: "store_unavailable",
} as const;

/** 503 for a store error; other errors are rethrown (→ 500). */
export function storeUnavailable(err: unknown, where: string): StatusPostResult {
  if (!(err instanceof StoreUnavailableError)) throw err;
  console.error(`[agent-ops] ${where}: store unavailable`, err.message);
  return { status: 503, body: { ...STORE_UNAVAILABLE_BODY } };
}

/**
 * Snapshot + this agent's blockers after a committed write. The write has
 * already succeeded, so a read-back failure doesn't turn it into an error:
 * the response says so (snapshot: null, snapshotError) instead of guessing.
 */
async function readBack(agentId: string) {
  try {
    const snapshot = await getSnapshotWithBlockers();
    const parkedBlockers =
      snapshot.agents[agentId]?.parkedBlockers ??
      (await listParkedBlockers([agentId]))[agentId] ??
      [];
    return { snapshot, parkedBlockers };
  } catch (err) {
    if (!(err instanceof StoreUnavailableError)) throw err;
    console.error("[agent-ops] read-back after write failed", err.message);
    return null;
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
    let result: Awaited<ReturnType<typeof applyHeartbeat>>;
    try {
      result = await applyHeartbeat(body);
    } catch (err) {
      return storeUnavailable(err, "heartbeat write");
    }
    if (!result.ok) {
      return {
        status: result.status,
        body: {
          error: result.error,
          code: result.status === 404 ? "unknown_agent" : "invalid_body",
        },
      };
    }
    const back = await readBack(result.row.agentId);
    return {
      status: 200,
      body: back
        ? { ok: true, row: { ...result.row, parkedBlockers: back.parkedBlockers }, snapshot: back.snapshot }
        : { ok: true, row: result.row, snapshot: null, snapshotError: "store_unavailable" },
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
    // Store errors and unexpected script replies alike: nothing was applied.
    console.error("[agent-ops] status write failed", err);
    return { status: 503, body: { ...STORE_UNAVAILABLE_BODY } };
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

  const back = await readBack(resolved.id);
  if (!back) {
    return {
      status: 200,
      body: { ok: true, row: result.row, blocker, snapshot: null, snapshotError: "store_unavailable" },
    };
  }
  const { snapshot, parkedBlockers } = back;
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
