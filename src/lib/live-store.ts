import type { AgentOpsRow, AgentOpsSnapshot } from "./live-types";
import { LIVE_SCHEMA_VERSION } from "./live-types";

const REDIS_KEY = "pt:agent-ops:status:v1";

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

async function redisCommand(args: unknown[]): Promise<unknown> {
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

export function storageMode(): "redis" | "memory" {
  return redisConfigured() ? "redis" : "memory";
}

export async function getSnapshot(): Promise<AgentOpsSnapshot> {
  const storage = storageMode();
  if (storage === "redis") {
    try {
      const raw = await redisCommand(["GET", REDIS_KEY]);
      if (typeof raw === "string" && raw) {
        const parsed = JSON.parse(raw) as Omit<AgentOpsSnapshot, "storage">;
        return {
          schemaVersion: parsed.schemaVersion ?? LIVE_SCHEMA_VERSION,
          updatedAt: parsed.updatedAt ?? new Date().toISOString(),
          agents: parsed.agents ?? {},
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
    agents: { ...mem.agents },
    storage: "memory",
  };
}

export async function upsertAgentRow(row: AgentOpsRow): Promise<AgentOpsSnapshot> {
  const storage = storageMode();
  const now = new Date().toISOString();

  if (storage === "redis") {
    try {
      const current = await getSnapshot();
      const next: Omit<AgentOpsSnapshot, "storage"> = {
        schemaVersion: LIVE_SCHEMA_VERSION,
        updatedAt: now,
        agents: {
          ...current.agents,
          [row.agentId]: row,
        },
      };
      await redisCommand(["SET", REDIS_KEY, JSON.stringify(next)]);
      return { ...next, storage: "redis" };
    } catch (err) {
      console.error("[agent-ops] redis set failed, using memory", err);
    }
  }

  const mem = getMemory();
  mem.revision += 1;
  mem.updatedAt = now;
  mem.agents[row.agentId] = row;
  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    updatedAt: mem.updatedAt,
    agents: { ...mem.agents },
    storage: "memory",
  };
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
      await redisCommand(["SET", REDIS_KEY, JSON.stringify(next)]);
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
