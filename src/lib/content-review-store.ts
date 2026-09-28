import type {
  BudgetSummary,
  ContentPackage,
  ContentReviewMode,
  ContentStatus,
  CredibilityLabel,
  PlatformCopy,
} from "./content-review-types";
import {
  BUDGET_GBP,
  CONTENT_STATUSES,
  CREDIBILITY_LABELS,
  DEFAULT_REVISION_CAP,
  HARD_STOP_GBP,
  PLATFORM_IDS,
} from "./content-review-types";
import { buildMockPackages, MOCK_MONTH_TO_DATE_GBP } from "./content-review-mock";

/**
 * Content Review display cache. Same Upstash REST / in-memory pattern as
 * live-store.ts, but a separate key prefix so it can never touch the
 * agent-ops status key. Non-production deployments get their own namespace
 * so preview/mock actions never write into production review data.
 */

const KEY_PREFIX = "pt:content-review:";

function namespace(): string {
  const env = process.env.VERCEL_ENV || "local";
  return env === "production" ? `${KEY_PREFIX}v1:` : `${KEY_PREFIX}${env}:v1:`;
}

function packagesKey() {
  return `${namespace()}packages`;
}

declare global {
  // eslint-disable-next-line no-var
  var __ptContentReviewMemory: Map<string, ContentPackage> | undefined;
}

function memory(): Map<string, ContentPackage> {
  if (!globalThis.__ptContentReviewMemory) {
    globalThis.__ptContentReviewMemory = new Map();
  }
  return globalThis.__ptContentReviewMemory;
}

function redisUrl(): string | undefined {
  return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || undefined;
}

function redisToken(): string | undefined {
  return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || undefined;
}

function redisConfigured(): boolean {
  return Boolean(redisUrl() && redisToken());
}

async function redisCommand(args: unknown[]): Promise<unknown> {
  const res = await fetch(redisUrl()!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken()!}`,
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

export function webhookConfigured(): boolean {
  return Boolean(process.env.N8N_REVIEW_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET);
}

export function reviewMode(): ContentReviewMode {
  return {
    mock: !webhookConfigured(),
    protected: Boolean(process.env.REVIEW_ADMIN_PASSWORD),
    storage: storageMode(),
  };
}

/** Seed example packages only in mock mode (override with CONTENT_REVIEW_MOCK_SEED=0|1). */
function mockSeedEnabled(): boolean {
  const flag = process.env.CONTENT_REVIEW_MOCK_SEED;
  if (flag === "0") return false;
  if (flag === "1") return true;
  return !webhookConfigured();
}

async function readAll(): Promise<{ items: ContentPackage[]; storage: "redis" | "memory" }> {
  if (storageMode() === "redis") {
    try {
      const raw = (await redisCommand(["HGETALL", packagesKey()])) as string[] | null;
      const items: ContentPackage[] = [];
      if (Array.isArray(raw)) {
        for (let i = 1; i < raw.length; i += 2) {
          try {
            items.push(JSON.parse(raw[i]) as ContentPackage);
          } catch {
            // skip a corrupt entry rather than failing the whole list
          }
        }
      }
      return { items, storage: "redis" };
    } catch (err) {
      console.error("[content-review] redis read failed, using memory", err);
    }
  }
  return { items: Array.from(memory().values()), storage: "memory" };
}

async function writeOne(pkg: ContentPackage, onlyIfMissing = false): Promise<void> {
  if (storageMode() === "redis") {
    try {
      await redisCommand([
        onlyIfMissing ? "HSETNX" : "HSET",
        packagesKey(),
        pkg.contentId,
        JSON.stringify(pkg),
      ]);
      return;
    } catch (err) {
      console.error("[content-review] redis write failed, using memory", err);
    }
  }
  if (onlyIfMissing && memory().has(pkg.contentId)) return;
  memory().set(pkg.contentId, pkg);
}

async function seedIfEmpty(items: ContentPackage[]): Promise<ContentPackage[]> {
  if (items.length > 0 || !mockSeedEnabled()) return items;
  const seeds = buildMockPackages();
  for (const s of seeds) await writeOne(s, true);
  return (await readAll()).items;
}

function sortPackages(items: ContentPackage[]): ContentPackage[] {
  const rank = (s: ContentStatus) =>
    s === "review" ? 0 : s === "revising" ? 1 : s === "blocked" ? 3 : 2;
  return [...items].sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
}

export async function listPackages(status?: ContentStatus | null): Promise<ContentPackage[]> {
  const { items } = await readAll();
  let all = await seedIfEmpty(items);
  // Once the real webhook is live, hide any leftover example data.
  if (webhookConfigured() && process.env.CONTENT_REVIEW_MOCK_SEED !== "1") {
    all = all.filter((p) => !p.example);
  }
  const filtered = status ? all.filter((p) => p.status === status) : all;
  return sortPackages(filtered);
}

export async function getPackage(contentId: string): Promise<ContentPackage | null> {
  const all = await listPackages();
  return all.find((p) => p.contentId === contentId) ?? null;
}

export async function savePackage(pkg: ContentPackage): Promise<ContentPackage> {
  await writeOne(pkg);
  return pkg;
}

export async function resetMockPackages(): Promise<ContentPackage[]> {
  if (storageMode() === "redis") {
    try {
      const seeds = buildMockPackages();
      const args: unknown[] = ["HSET", packagesKey()];
      for (const s of seeds) args.push(s.contentId, JSON.stringify(s));
      await redisCommand(args);
      return listPackages();
    } catch (err) {
      console.error("[content-review] redis reset failed, using memory", err);
    }
  }
  for (const s of buildMockPackages()) memory().set(s.contentId, s);
  return listPackages();
}

export function budgetSummary(items: ContentPackage[]): BudgetSummary {
  const withMtd = items
    .filter((p) => typeof p.monthToDateGbp === "number")
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const latest = withMtd[0];
  return {
    monthToDateGbp: latest?.monthToDateGbp ?? (items.length ? 0 : MOCK_MONTH_TO_DATE_GBP),
    budgetGbp: BUDGET_GBP,
    hardStopGbp: HARD_STOP_GBP,
    example: latest ? Boolean(latest.example) : true,
  };
}

// ---------------------------------------------------------------------------
// Validation / normalisation of packages posted by n8n
// ---------------------------------------------------------------------------

const ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;

function num(v: unknown, fallback: number | null = null): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export type NormaliseResult =
  | { ok: true; pkg: ContentPackage }
  | { ok: false; error: string };

export function normalisePackage(input: unknown): NormaliseResult {
  if (!input || typeof input !== "object") return { ok: false, error: "Body must be a JSON object." };
  const b = input as Record<string, unknown>;

  const contentId = str(b.contentId);
  if (!ID_RE.test(contentId)) {
    return { ok: false, error: "contentId is required (letters, numbers, _ . : - only, max 120)." };
  }
  const revision = num(b.revision);
  if (revision === null || revision < 0 || !Number.isInteger(revision)) {
    return { ok: false, error: "revision must be a non-negative integer." };
  }
  const status = str(b.status) as ContentStatus;
  if (!CONTENT_STATUSES.includes(status)) {
    return { ok: false, error: `status must be one of ${CONTENT_STATUSES.join(", ")}.` };
  }
  const subject = str(b.subject).trim();
  if (!subject) return { ok: false, error: "subject is required." };

  const src = (b.source ?? {}) as Record<string, unknown>;
  const credibilityRaw = str(b.credibilityLabel).toUpperCase() as CredibilityLabel;
  const credibilityLabel: CredibilityLabel = CREDIBILITY_LABELS.includes(credibilityRaw)
    ? credibilityRaw
    : "FOLKLORE"; // weakest label when unsure (Verity rule 3)

  const platformsIn = Array.isArray(b.platforms) ? b.platforms : [];
  const platforms: PlatformCopy[] = [];
  for (const p of platformsIn) {
    if (!p || typeof p !== "object") continue;
    const id = str((p as Record<string, unknown>).platform);
    if (!(PLATFORM_IDS as readonly string[]).includes(id)) continue;
    const copy = { ...(p as object) } as PlatformCopy;
    if (id === "lemon8") (copy as { manual: true }).manual = true;
    platforms.push(copy);
  }

  const script = (b.script ?? {}) as Record<string, unknown>;
  const video = b.video && typeof b.video === "object" ? (b.video as ContentPackage["video"]) : null;

  const pkg: ContentPackage = {
    contentId,
    revision,
    status,
    subject,
    source: {
      tab: str(src.tab, "Unknown tab"),
      row: num(src.row, 0) ?? 0,
      sheetUrl: typeof src.sheetUrl === "string" ? src.sheetUrl : null,
    },
    credibilityLabel,
    credibility:
      b.credibility && typeof b.credibility === "object"
        ? (b.credibility as ContentPackage["credibility"])
        : undefined,
    aiIllustration: b.aiIllustration !== false,
    sensitive: b.sensitive === true,
    blockedReason: typeof b.blockedReason === "string" ? b.blockedReason : null,
    video,
    script: {
      hook: str(script.hook),
      narration: str(script.narration),
      scenes: Array.isArray(script.scenes) ? (script.scenes as ContentPackage["script"]["scenes"]) : [],
    },
    platforms,
    revisionCount: num(b.revisionCount, 0) ?? 0,
    revisionCap: num(b.revisionCap, DEFAULT_REVISION_CAP) ?? DEFAULT_REVISION_CAP,
    costEstimateGbp: num(b.costEstimateGbp),
    costActualGbp: num(b.costActualGbp),
    monthToDateGbp: num(b.monthToDateGbp),
    stageCostEstimatesGbp:
      b.stageCostEstimatesGbp && typeof b.stageCostEstimatesGbp === "object"
        ? (b.stageCostEstimatesGbp as ContentPackage["stageCostEstimatesGbp"])
        : undefined,
    history: Array.isArray(b.history) ? (b.history as ContentPackage["history"]) : [],
    updatedAt: str(b.updatedAt) || new Date().toISOString(),
    example: b.example === true,
  };
  return { ok: true, pkg };
}
