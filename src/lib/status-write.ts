import type { ParkedBlocker } from "@/types";
import type { AgentOpsRow } from "./live-types";
import { LIVE_SCHEMA_VERSION } from "./live-types";
import {
  LONE_SURROGATE,
  STATUS_REDIS_KEY,
  memoryBucket,
  redisCommand,
  storageMode,
} from "./live-store";
import { PARKED_MAX_PER_AGENT, coerceBlocker } from "./parked-blockers";
import { parkedMemory } from "./parked-store";
import { STATUS_WRITE_LUA, parkedKey } from "./status-lua";

export type RowWrite =
  | { mode: "full"; row: AgentOpsRow }
  | {
      mode: "merge";
      patch: Partial<AgentOpsRow>;
      /** Used when the agent has no stored row yet. */
      createRow: AgentOpsRow;
    };

export type BlockerWrite =
  | {
      type: "park";
      blocker: { id: string; title: string; reason: string; since?: string };
    }
  | { type: "clear"; id: string };

export interface StatusWriteInput {
  agentId: string;
  row?: RowWrite;
  blocker?: BlockerWrite;
  /** Fail with no_live_row when the agent has no stored row. */
  requireRow?: boolean;
}

export type BlockerOutcome =
  | { op: "park"; result: "created" | "updated"; blocker: ParkedBlocker }
  | { op: "clear"; id: string; removed: boolean };

export type StatusWriteResult =
  | { ok: true; row: AgentOpsRow | null; blocker?: BlockerOutcome }
  | { ok: false; code: "no_live_row" | "blocker_limit" };

/**
 * JSON for the Lua side. cjson rejects lone UTF-16 surrogate escapes, so they
 * become U+FFFD (they can't be valid UTF-8 anyway).
 */
function toLuaJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    typeof v === "string" ? v.replace(LONE_SURROGATE, "\uFFFD") : v
  );
}

/**
 * Atomic status write: optional row replace/merge + optional blocker action,
 * all-or-nothing. Redis: one EVAL (see status-lua.ts). Memory: synchronous in
 * one process, same checks in the same order. Store errors throw.
 */
export async function writeStatus(
  input: StatusWriteInput
): Promise<StatusWriteResult> {
  const now = new Date().toISOString();
  const since = input.blocker?.type === "park"
    ? (input.blocker.blocker.since ?? now)
    : "";

  if (storageMode() === "redis") {
    const b = input.blocker;
    const tail =
      b?.type === "park"
        ? toLuaJson({
            id: b.blocker.id,
            title: b.blocker.title,
            reason: b.blocker.reason,
          }).slice(1)
        : "";
    const res = (await redisCommand([
      "EVAL",
      STATUS_WRITE_LUA,
      2,
      STATUS_REDIS_KEY,
      parkedKey(input.agentId),
      input.agentId,
      input.row?.mode ?? "none",
      input.row
        ? toLuaJson(input.row.mode === "full" ? input.row.row : input.row.patch)
        : "",
      input.row?.mode === "merge" ? toLuaJson(input.row.createRow) : "",
      now,
      LIVE_SCHEMA_VERSION,
      input.requireRow ? "1" : "0",
      b?.type ?? "none",
      b ? (b.type === "park" ? b.blocker.id : b.id) : "",
      tail,
      since,
      PARKED_MAX_PER_AGENT,
    ])) as string[];
    const tag = res?.[0];
    if (tag === "no_live_row" || tag === "blocker_limit") {
      return { ok: false, code: tag };
    }
    if (tag !== "ok") throw new Error(`status write failed: ${String(tag)}`);
    const row = res[1] ? (JSON.parse(res[1]) as AgentOpsRow) : null;
    let blocker: BlockerOutcome | undefined;
    if (b?.type === "park") {
      const parsed = coerceBlocker(JSON.parse(res[3]!));
      if (!parsed) throw new Error("Unexpected parked blocker value from Redis");
      blocker = {
        op: "park",
        result: res[2] === "2" ? "updated" : "created",
        blocker: parsed,
      };
    } else if (b?.type === "clear") {
      blocker = { op: "clear", id: b.id, removed: Number(res[2]) > 0 };
    }
    return { ok: true, row, blocker };
  }

  // Memory mode — synchronous from here on, so atomic within the process.
  const mem = memoryBucket();
  const existing = mem.agents[input.agentId] ?? null;
  if (input.requireRow && !existing) return { ok: false, code: "no_live_row" };

  const lists = parkedMemory();
  let blocker: BlockerOutcome | undefined;
  const b = input.blocker;
  if (b?.type === "park") {
    const list = lists.get(input.agentId) ?? new Map<string, ParkedBlocker>();
    const cur = list.get(b.blocker.id);
    if (!cur && list.size >= PARKED_MAX_PER_AGENT) {
      return { ok: false, code: "blocker_limit" };
    }
    const next: ParkedBlocker = {
      id: b.blocker.id,
      title: b.blocker.title,
      reason: b.blocker.reason,
      since: cur?.since ?? since,
    };
    list.set(next.id, next);
    lists.set(input.agentId, list);
    blocker = { op: "park", result: cur ? "updated" : "created", blocker: next };
  } else if (b?.type === "clear") {
    const removed = lists.get(input.agentId)?.delete(b.id) ?? false;
    blocker = { op: "clear", id: b.id, removed };
  }

  let row: AgentOpsRow | null = existing;
  if (input.row) {
    row =
      input.row.mode === "full"
        ? input.row.row
        : existing
          ? { ...existing, ...input.row.patch }
          : input.row.createRow;
    mem.revision += 1;
    mem.updatedAt = now;
    mem.agents[input.agentId] = row;
  }
  return { ok: true, row: row ? { ...row } : null, blocker };
}
