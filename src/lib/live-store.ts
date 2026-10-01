import type { AgentOpsRow, AgentOpsSnapshot } from "./live-types";
import {
  AGENT_ROW_FIELDS,
  LIVE_SCHEMA_VERSION,
  normaliseStoredRow,
} from "./live-types";
import {
  STATUS_WRITE_LUA,
  parkedIndexKey,
  parkedKey,
  statusRedisKey,
} from "./status-lua";

export { statusRedisKey };

/** Known row fields for the Lua encoder (ARGV[13]). */
export const LUA_ROW_FIELDS = AGENT_ROW_FIELDS.join(",");

/** Every stored row → canonical legacy shape (missing known fields → null). */
function normaliseAgents(agents: unknown): Record<string, AgentOpsRow> {
  if (!agents || typeof agents !== "object" || Array.isArray(agents)) return {};
  const out: Record<string, AgentOpsRow> = {};
  for (const [id, row] of Object.entries(agents as Record<string, unknown>)) {
    out[id] = normaliseStoredRow(row);
  }
  return out;
}

type MemoryBucket = {
  revision: number;
  updatedAt: string;
  agents: Record<string, AgentOpsRow>;
};

declare global {
  // eslint-disable-next-line no-var
  var __ptAgentOpsMemory: MemoryBucket | undefined;
}

function emptyBucket(): MemoryBucket {
  return {
    revision: 0,
    updatedAt: new Date().toISOString(),
    agents: {},
  };
}

export function memoryBucket(): MemoryBucket {
  return getMemory();
}

function getMemory(): MemoryBucket {
  if (!globalThis.__ptAgentOpsMemory) {
    globalThis.__ptAgentOpsMemory = emptyBucket();
  }
  return globalThis.__ptAgentOpsMemory;
}

function redisUrl(): string | undefined {
  return (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    undefined
  );
}

function redisToken(): string | undefined {
  return (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    undefined
  );
}

function redisConfigured(): boolean {
  return Boolean(redisUrl() && redisToken());
}

/**
 * The status store (Redis) could not be used. Routes turn this into
 * 503 { code: "store_unavailable" }. There is deliberately NO fallback to
 * the in-memory store once Redis is configured: on Vercel every serverless
 * instance has its own memory, so a fallback silently splits the data
 * (writes "succeed" into one instance, reads flip between instances and the
 * frozen Redis copy).
 */
export class StoreUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StoreUnavailableError";
  }
}

async function upstashFailure(res: Response, what: string): Promise<StoreUnavailableError> {
  const text = await res.text().catch(() => "");
  return new StoreUnavailableError(`${what} ${res.status}: ${text.slice(0, 200)}`);
}

/** Single Upstash REST command. Throws on HTTP or Redis error. */
export async function redisCommand(args: unknown[]): Promise<unknown> {
  const url = redisUrl()!;
  const token = redisToken()!;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw await upstashFailure(res, "Upstash error");
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new StoreUnavailableError(`Upstash error: ${json.error.slice(0, 200)}`);
  return json.result;
}

/**
 * Upstash REST pipeline (one HTTP round trip, commands run in order; not a
 * transaction). Returns each command's result; throws if any errored.
 */
export async function redisPipeline(commands: unknown[][]): Promise<unknown[]> {
  if (commands.length === 0) return [];
  const url = redisUrl()!;
  const token = redisToken()!;
  const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!res.ok) throw await upstashFailure(res, "Upstash pipeline error");
  const json = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  return json.map((item) => {
    if (item.error) {
      throw new StoreUnavailableError(`Upstash pipeline command error: ${item.error.slice(0, 200)}`);
    }
    return item.result;
  });
}

/** cjson (Lua) rejects lone UTF-16 surrogates; they become U+FFFD. */
export const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Which store to use. Redis whenever it is configured (all Vercel envs);
 * the in-memory store only for local dev/tests without Redis. In production
 * without Redis this throws (503) instead of silently using per-instance
 * memory.
 */
export function storageMode(): "redis" | "memory" {
  if (redisConfigured()) return "redis";
  if (process.env.VERCEL_ENV === "production") {
    throw new StoreUnavailableError("No Redis store configured in production");
  }
  return "memory";
}

export async function getSnapshot(): Promise<AgentOpsSnapshot> {
  if (storageMode() === "redis") {
    // Errors propagate (→ 503); never a memory fallback.
    return snapshotFromRaw(await redisCommand(["GET", statusRedisKey()]));
  }
  const mem = getMemory();
  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    updatedAt: mem.updatedAt,
    agents: normaliseAgents(mem.agents),
    storage: "memory",
  };
}

/** Stored JSON string (or null) → snapshot. Corrupt JSON → store error. */
export function snapshotFromRaw(raw: unknown): AgentOpsSnapshot {
  if (typeof raw === "string" && raw) {
    let parsed: Omit<AgentOpsSnapshot, "storage">;
    try {
      parsed = JSON.parse(raw) as Omit<AgentOpsSnapshot, "storage">;
    } catch (err) {
      throw new StoreUnavailableError("Stored status JSON is corrupt", { cause: err });
    }
    return {
      schemaVersion: parsed.schemaVersion ?? LIVE_SCHEMA_VERSION,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      agents: normaliseAgents(parsed.agents),
      storage: "redis",
    };
  }
  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    agents: {},
    storage: "redis",
  };
}

/**
 * Full-row replace for one agent (plain heartbeat).
 *
 * Redis: a single atomic EVAL (STATUS_WRITE_LUA, rowMode "full") that updates
 * only this agent inside the existing JSON key. The old GET-then-SET lost rows
 * when heartbeats for different agents raced (the last SET won). A Redis
 * error throws StoreUnavailableError (→ 503); there is no memory fallback.
 */
export async function upsertAgentRow(row: AgentOpsRow): Promise<void> {
  const storage = storageMode();
  const now = new Date().toISOString();

  if (storage === "redis") {
    const res = (await redisCommand([
      "EVAL",
      STATUS_WRITE_LUA,
      3,
      statusRedisKey(),
      parkedKey(row.agentId),
      parkedIndexKey(),
      row.agentId,
      "full",
      JSON.stringify(row, (_k, v) =>
        typeof v === "string" ? v.replace(LONE_SURROGATE, "\uFFFD") : v
      ),
      "",
      now,
      LIVE_SCHEMA_VERSION,
      "0",
      "none",
      "",
      "",
      "",
      0,
      LUA_ROW_FIELDS,
      "",
    ])) as string[];
    if (res?.[0] !== "ok") {
      throw new StoreUnavailableError(`status write failed: ${String(res?.[0])}`);
    }
    return;
  }

  const mem = getMemory();
  mem.revision += 1;
  mem.updatedAt = now;
  mem.agents[row.agentId] = row;
}

export async function replaceAgents(
  agents: Record<string, AgentOpsRow>
): Promise<AgentOpsSnapshot> {
  const storage = storageMode();
  const now = new Date().toISOString();
  const next: Omit<AgentOpsSnapshot, "storage"> = {
    schemaVersion: LIVE_SCHEMA_VERSION,
    updatedAt: now,
    agents,
  };

  if (storage === "redis") {
    // Errors propagate (→ 503); never a memory fallback.
    await redisCommand(["SET", statusRedisKey(), JSON.stringify(next)]);
    return { ...next, storage: "redis" };
  }

  const mem = getMemory();
  mem.revision += 1;
  mem.updatedAt = now;
  mem.agents = { ...agents };
  return { ...next, storage: "memory" };
}

export function assertWriteToken(authHeader: string | null): boolean {
  const expected = process.env.OPS_WRITE_TOKEN;
  if (!expected) return false;
  if (!authHeader) return false;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!m) return false;
  return m[1] === expected;
}
