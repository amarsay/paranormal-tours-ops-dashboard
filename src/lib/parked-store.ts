import type { ParkedBlocker } from "@/types";
import { redisPipeline, storageMode } from "./live-store";
import { coerceBlocker, sortBlockers } from "./parked-blockers";
import { parkedIndexKey, parkedKey, parkedKeyPrefix } from "./status-lua";

/**
 * Parked-blocker reads + in-memory store. Writes (park / clear, together with
 * any heartbeat fields in the same POST) go through writeStatus() in
 * status-write.ts — one atomic Redis EVAL, see status-lua.ts.
 *
 * Redis layout: pt:agent-ops:parked:v1:<agentId> hash, field = blocker id,
 * value '{"since":"…","id":…,"title":…,"reason":…}'; plus the set
 * pt:agent-ops:parked-index:v1 of agentIds that have any (see status-lua).
 */

export { parkedIndexKey, parkedKey, parkedKeyPrefix };

declare global {
  // eslint-disable-next-line no-var
  var __ptParkedMemory: Map<string, Map<string, ParkedBlocker>> | undefined;
}

export function parkedMemory(): Map<string, Map<string, ParkedBlocker>> {
  if (!globalThis.__ptParkedMemory) globalThis.__ptParkedMemory = new Map();
  return globalThis.__ptParkedMemory;
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

/**
 * Parked blockers for the given agents (oldest first). Missing → [].
 * Redis: pass the SMEMBERS result of the parked index when you already have
 * it (getSnapshotWithBlockers reads it in the same pipeline as the status
 * key); only agents in the index are fetched, so no blockers = 0 HGETALLs.
 * Store errors throw (→ 503); they are never turned into [].
 */
export async function listParkedBlockers(
  agentIds: string[],
  indexMembers?: string[]
): Promise<Record<string, ParkedBlocker[]>> {
  const out: Record<string, ParkedBlocker[]> = {};
  for (const id of agentIds) out[id] = [];
  if (agentIds.length === 0) return out;

  if (storageMode() === "redis") {
    const members = new Set(
      indexMembers ??
        ((await redisPipeline([["SMEMBERS", parkedIndexKey()]]))[0] as string[] | null) ??
        []
    );
    const wanted = agentIds.filter((id) => members.has(id));
    if (wanted.length === 0) return out;
    const results = await redisPipeline(wanted.map((id) => ["HGETALL", parkedKey(id)]));
    wanted.forEach((id, i) => {
      out[id] = parseHash(results[i]);
    });
    return out;
  }

  const mem = parkedMemory();
  for (const id of agentIds) {
    out[id] = sortBlockers(Array.from(mem.get(id)?.values() ?? []));
  }
  return out;
}
