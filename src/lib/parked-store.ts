import type { ParkedBlocker } from "@/types";
import { redisCommand, redisPipeline, storageMode } from "./live-store";
import {
  PARKED_MAX_PER_AGENT,
  coerceBlocker,
  sortBlockers,
} from "./parked-blockers";

/**
 * Parked-blocker storage.
 *
 * Concurrency: blockers are NOT stored inside the shared status JSON blob
 * (that blob is read-modify-written by every heartbeat). Each agent gets its
 * own Redis hash, field = blocker id:
 *
 *   pt:agent-ops:parked:v1:<agentId>   { <blockerId>: '{"since":…,"id":…,…}' }
 *
 * - park  = one EVAL (Lua runs atomically in Redis): HGET existing → keep its
 *           `since`, else enforce the 10-per-agent cap with HLEN → HSET.
 *           Two concurrent parks can't both squeeze past the cap, and an
 *           update never loses the original `since`.
 * - clear = HDEL (atomic; 0 = unknown id, still a 200).
 * - read  = one pipelined HGETALL per agent row in the snapshot.
 *
 * Heartbeats never touch these keys, so a heartbeat racing a park/clear can't
 * clobber it (and vice versa). In memory mode (next dev) every op is
 * synchronous inside one Node process, so it is atomic too.
 */

export const PARKED_KEY_PREFIX = "pt:agent-ops:parked:v1:";

export function parkedKey(agentId: string): string {
  return `${PARKED_KEY_PREFIX}${agentId}`;
}

/**
 * KEYS[1] hash · ARGV[1] blocker id · ARGV[2] JSON tail (object without the
 * opening brace and without `since`) · ARGV[3] candidate since · ARGV[4] cap.
 * Stored values always start with {"since":"…", so the original `since` can
 * be read back without cjson. `since` is validated ISO 8601 (no quotes).
 * Returns {status, value}: 0 = full (409), 1 = created, 2 = updated.
 */
export const PARK_LUA = `
local cur = redis.call('HGET', KEYS[1], ARGV[1])
local since = ARGV[3]
if cur then
  local s = string.match(cur, '^{"since":"([^"]*)"')
  if s then since = s end
else
  if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[4]) then
    return {0, ''}
  end
end
local val = '{"since":"' .. since .. '",' .. ARGV[2]
redis.call('HSET', KEYS[1], ARGV[1], val)
if cur then return {2, val} end
return {1, val}
`;

export type ParkResult =
  | { ok: true; result: "created" | "updated"; blocker: ParkedBlocker }
  | { ok: false; status: 409; error: string };

declare global {
  // eslint-disable-next-line no-var
  var __ptParkedMemory: Map<string, Map<string, ParkedBlocker>> | undefined;
}

function memory(): Map<string, Map<string, ParkedBlocker>> {
  if (!globalThis.__ptParkedMemory) globalThis.__ptParkedMemory = new Map();
  return globalThis.__ptParkedMemory;
}

function fullError(): ParkResult {
  return {
    ok: false,
    status: 409,
    error: `Agent already has ${PARKED_MAX_PER_AGENT} parked blockers — clear one first`,
  };
}

/**
 * Upsert by id. `since` is used only when creating; updates keep the stored
 * value. Redis errors propagate (the route answers 503 and applies nothing).
 */
export async function parkBlocker(
  agentId: string,
  input: { id: string; title: string; reason: string; since?: string }
): Promise<ParkResult> {
  const since = input.since ?? new Date().toISOString();

  if (storageMode() === "redis") {
    const tail = JSON.stringify({
      id: input.id,
      title: input.title,
      reason: input.reason,
    }).slice(1);
    const res = (await redisCommand([
      "EVAL",
      PARK_LUA,
      1,
      parkedKey(agentId),
      input.id,
      tail,
      since,
      PARKED_MAX_PER_AGENT,
    ])) as [number, string];
    const status = Number(res?.[0]);
    if (status === 0) return fullError();
    const blocker = coerceBlocker(JSON.parse(String(res[1])));
    if (!blocker) throw new Error("Unexpected parked blocker value from Redis");
    return { ok: true, result: status === 2 ? "updated" : "created", blocker };
  }

  const mem = memory();
  const list = mem.get(agentId) ?? new Map<string, ParkedBlocker>();
  const existing = list.get(input.id);
  if (!existing && list.size >= PARKED_MAX_PER_AGENT) return fullError();
  const blocker: ParkedBlocker = {
    since: existing?.since ?? since,
    id: input.id,
    title: input.title,
    reason: input.reason,
  };
  list.set(input.id, blocker);
  mem.set(agentId, list);
  return { ok: true, result: existing ? "updated" : "created", blocker };
}

/** Remove by id. Returns whether anything was removed (unknown id → false). */
export async function clearBlocker(agentId: string, id: string): Promise<boolean> {
  if (storageMode() === "redis") {
    const n = await redisCommand(["HDEL", parkedKey(agentId), id]);
    return Number(n) > 0;
  }
  return memory().get(agentId)?.delete(id) ?? false;
}

function parseHash(raw: unknown): ParkedBlocker[] {
  const out: ParkedBlocker[] = [];
  const push = (v: unknown) => {
    try {
      const b = coerceBlocker(typeof v === "string" ? JSON.parse(v) : v);
      if (b) out.push(b);
    } catch {
      /* skip corrupt entry */
    }
  };
  if (Array.isArray(raw)) {
    // Upstash REST HGETALL → [field, value, field, value, …]
    for (let i = 1; i < raw.length; i += 2) push(raw[i]);
  } else if (raw && typeof raw === "object") {
    for (const v of Object.values(raw)) push(v);
  }
  return sortBlockers(out);
}

/** Parked blockers for the given agents (oldest first). Missing → []. */
export async function listParkedBlockers(
  agentIds: string[]
): Promise<Record<string, ParkedBlocker[]>> {
  const out: Record<string, ParkedBlocker[]> = {};
  for (const id of agentIds) out[id] = [];
  if (agentIds.length === 0) return out;

  if (storageMode() === "redis") {
    const results = await redisPipeline(
      agentIds.map((id) => ["HGETALL", parkedKey(id)])
    );
    agentIds.forEach((id, i) => {
      out[id] = parseHash(results[i]);
    });
    return out;
  }

  const mem = memory();
  for (const id of agentIds) {
    out[id] = sortBlockers(Array.from(mem.get(id)?.values() ?? []));
  }
  return out;
}
