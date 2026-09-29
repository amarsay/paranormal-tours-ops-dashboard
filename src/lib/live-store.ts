import type { AgentOpsRow, AgentOpsSnapshot } from "./live-types";
import {
  AGENT_ROW_FIELDS,
  LIVE_SCHEMA_VERSION,
  normaliseStoredRow,
} from "./live-types";
import { STATUS_WRITE_LUA, parkedKey, statusRedisKey } from "./status-lua";

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
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstash error ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { result?: unknown };
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
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstash pipeline error ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  return json.map((item) => {
    if (item.error) throw new Error(`Upstash pipeline command error: ${item.error}`);
    return item.result;
  });
}

/** cjson (Lua) rejects lone UTF-16 surrogates; they become U+FFFD. */
export const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function storageMode(): "redis" | "memory" {
  return redisConfigured() ? "redis" : "memory";
}

export async function getSnapshot(): Promise<AgentOpsSnapshot> {
  const storage = storageMode();
  if (storage === "redis") {
    try {
      const raw = await redisCommand(["GET", statusRedisKey()]);
      if (typeof raw === "string" && raw) {
        const parsed = JSON.parse(raw) as Omit<AgentOpsSnapshot, "storage">;
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
    } catch (err) {
      console.error("[agent-ops] redis get failed, falling back to memory", err);
    }
  }

  const mem = getMemory();
  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    updatedAt: mem.updatedAt,
    agents: normaliseAgents(mem.agents),
    storage: "memory",
  };
}

/**
 * Full-row replace for one agent (plain heartbeat).
 *
 * Redis: a single atomic EVAL (STATUS_WRITE_LUA, rowMode "full") that updates
 * only this agent inside the existing JSON key. The old GET-then-SET lost rows
 * when heartbeats for different agents raced (the last SET won). On a Redis
 * error it still falls back to memory, as before.
 */
export async function upsertAgentRow(row: AgentOpsRow): Promise<void> {
  const storage = storageMode();
  const now = new Date().toISOString();

  if (storage === "redis") {
    try {
      const res = (await redisCommand([
        "EVAL",
        STATUS_WRITE_LUA,
        2,
        statusRedisKey(),
        parkedKey(row.agentId),
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
      if (res?.[0] !== "ok") throw new Error(`status write failed: ${String(res?.[0])}`);
      return;
    } catch (err) {
      console.error("[agent-ops] redis set failed, using memory", err);
    }
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
    try {
      await redisCommand(["SET", statusRedisKey(), JSON.stringify(next)]);
      return { ...next, storage: "redis" };
    } catch (err) {
      console.error("[agent-ops] redis replace failed, using memory", err);
    }
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
