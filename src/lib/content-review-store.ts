import type {
  BudgetSummary,
  ContentHistoryEntry,
  ContentPackage,
  ContentReviewMode,
  ContentStatus,
  CredibilityLabel,
  PlatformCopy,
  PlatformStatus,
  QaFlag,
  SheetRef,
  UpdateSource,
} from "./content-review-types";
import {
  BUDGET_GBP,
  CONTENT_STATUSES,
  CREDIBILITY_LABELS,
  DEFAULT_REVISION_CAP,
  HARD_STOP_GBP,
  LEGACY_CONTENT_STATUS,
  LEGACY_PLATFORM_STATUS,
  PLATFORM_IDS,
  PLATFORM_STATUSES,
  QA_CHECKS,
  UPDATE_SOURCES,
} from "./content-review-types";
import { buildMockPackages, MOCK_MONTH_TO_DATE_GBP } from "./content-review-mock";
import { defaultPlatformStatus, isAwaitingReview, isHeld, pendingResolvedBy } from "./content-review-rules";

/**
 * Content Review display cache. Same Upstash REST / in-memory pattern as
 * live-store.ts, but a separate key prefix so it can never touch the
 * agent-ops status key. Non-production deployments get their own namespace
 * so preview/mock actions never write into production review data.
 */

const KEY_PREFIX = "pt:content-review:";
/** v2 = packageId-keyed hash (v1 was contentId); old v1 keys are simply ignored. */
const SCHEMA = "v2";

function namespace(): string {
  const env = process.env.VERCEL_ENV || "local";
  return env === "production" ? `${KEY_PREFIX}${SCHEMA}:` : `${KEY_PREFIX}${env}:${SCHEMA}:`;
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
            items.push(upgradeStored(JSON.parse(raw[i])));
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
        pkg.packageId,
        JSON.stringify(pkg),
      ]);
      return;
    } catch (err) {
      console.error("[content-review] redis write failed, using memory", err);
    }
  }
  if (onlyIfMissing && memory().has(pkg.packageId)) return;
  memory().set(pkg.packageId, pkg);
}

async function seedIfEmpty(items: ContentPackage[]): Promise<ContentPackage[]> {
  if (items.length > 0 || !mockSeedEnabled()) return items;
  const seeds = buildMockPackages();
  for (const s of seeds) await writeOne(s, true);
  return (await readAll()).items;
}

function sortPackages(items: ContentPackage[]): ContentPackage[] {
  const rank = (p: ContentPackage) =>
    isHeld(p) ? 0 : isAwaitingReview(p) ? 1 : p.status === "revising" ? 2 : p.status === "blocked" ? 4 : 3;
  return [...items].sort((a, b) => {
    const r = rank(a) - rank(b);
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
  return sortPackages(status ? filterByStatus(all, status) : all);
}

/** `review` is derived from the platform rows; other statuses match the package status. */
export function filterByStatus(items: ContentPackage[], status: ContentStatus): ContentPackage[] {
  return status === "review" ? items.filter(isAwaitingReview) : items.filter((p) => p.status === status);
}

export async function getPackage(packageId: string): Promise<ContentPackage | null> {
  const all = await listPackages();
  return all.find((p) => p.packageId === packageId) ?? null;
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
      for (const s of seeds) args.push(s.packageId, JSON.stringify(s));
      await redisCommand(args);
      return listPackages();
    } catch (err) {
      console.error("[content-review] redis reset failed, using memory", err);
    }
  }
  for (const s of buildMockPackages()) memory().set(s.packageId, s);
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
// Validation / normalisation of packages posted by n8n (sheet is the source
// of truth; n8n relays it). Legacy field names are accepted on the way in.
// ---------------------------------------------------------------------------

const ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;

function num(v: unknown, fallback: number | null = null): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function contentStatus(v: unknown): ContentStatus | null {
  const s = str(v);
  if ((CONTENT_STATUSES as readonly string[]).includes(s)) return s as ContentStatus;
  return LEGACY_CONTENT_STATUS[s] ?? null;
}

function rowStatus(v: unknown): PlatformStatus | null {
  const s = str(v);
  if ((PLATFORM_STATUSES as readonly string[]).includes(s)) return s as PlatformStatus;
  return LEGACY_PLATFORM_STATUS[s] ?? null;
}

function sheetRefFrom(v: unknown): SheetRef | null {
  if (!isObj(v)) return null;
  return {
    tab: str(v.tab, "Unknown tab"),
    row: num(v.row, 0) ?? 0,
    sheetUrl: typeof v.sheetUrl === "string" ? v.sheetUrl : null,
  };
}

/** Old cached shapes (contentId, source object, rejected/skipped) → current shape. */
export function upgradeStored(raw: unknown): ContentPackage {
  const b = (isObj(raw) ? raw : {}) as Record<string, unknown>;
  const pkg = { ...b } as unknown as ContentPackage & Record<string, unknown>;
  if (!pkg.packageId && typeof b.contentId === "string") pkg.packageId = b.contentId;
  delete pkg.contentId;
  if (!pkg.sheetRef) pkg.sheetRef = sheetRefFrom(b.source) ?? { tab: "Unknown tab", row: 0, sheetUrl: null };
  if (isObj(b.source)) delete pkg.source;
  pkg.status = contentStatus(b.status) ?? "review";
  pkg.platforms = (Array.isArray(b.platforms) ? b.platforms : []).map((p: PlatformCopy) => ({
    ...p,
    status: rowStatus(p.status) ?? defaultPlatformStatus(pkg.status),
  }));
  return pkg;
}

type Fields = Record<string, unknown>;

/** Per-row validation shared by full packages and same-revision updates. */
function parsePlatforms(input: unknown, pkgStatus: ContentStatus): { ok: true; rows: PlatformCopy[] } | { ok: false; error: string } {
  const rows: PlatformCopy[] = [];
  for (const p of Array.isArray(input) ? input : []) {
    if (!isObj(p)) continue;
    const id = str(p.platform);
    if (!(PLATFORM_IDS as readonly string[]).includes(id)) {
      return { ok: false, error: `Unknown platform: ${id || "(missing)"}` };
    }
    const copy = { ...p } as unknown as PlatformCopy;
    if (p.status !== undefined) {
      const st = rowStatus(p.status);
      if (!st) return { ok: false, error: `platforms[${id}].status must be one of ${PLATFORM_STATUSES.join(", ")}.` };
      copy.status = st;
    } else {
      copy.status = defaultPlatformStatus(pkgStatus);
    }
    if (id === "lemon8") (copy as { manual: true }).manual = true;
    if ("postedAt" in p) copy.postedAt = typeof p.postedAt === "string" ? p.postedAt : null;
    if ("postedRevision" in p) copy.postedRevision = Number.isInteger(p.postedRevision) ? (p.postedRevision as number) : null;
    if (id === "youtube" && "selectedTitle" in p) {
      const t = p.selectedTitle;
      if (t !== null && typeof t !== "string") return { ok: false, error: "platforms[youtube].selectedTitle must be a string or null." };
      (copy as { selectedTitle?: string | null }).selectedTitle = typeof t === "string" && t.trim() ? t.slice(0, 200) : null;
    } else if (id !== "youtube") {
      delete (copy as { selectedTitle?: unknown }).selectedTitle;
    }
    rows.push(copy);
  }
  return { ok: true, rows };
}

export type InboundMeta = {
  packageId: string;
  revision: number;
  source: UpdateSource;
  /** Explicit `sensitive: false` was sent. */
  sensitiveFalse: boolean;
  clearPending: boolean;
};

export type ParseResult = { ok: true; meta: InboundMeta; body: Fields } | { ok: false; error: string };

/** Pull the identity fields out of an inbound POST (packageId, legacy contentId alias, source). */
export function parseInboundMeta(input: unknown): ParseResult {
  if (!isObj(input)) return { ok: false, error: "Body must be a JSON object." };
  const packageId = str(input.packageId) || str(input.contentId); // contentId = legacy alias
  if (!ID_RE.test(packageId)) {
    return { ok: false, error: "packageId is required (letters, numbers, _ . : - only, max 120)." };
  }
  if (input.packageId && input.contentId && input.packageId !== input.contentId) {
    return { ok: false, error: "packageId and legacy contentId disagree; send packageId only." };
  }
  const revision = num(input.revision);
  if (revision === null || revision < 0 || !Number.isInteger(revision)) {
    return { ok: false, error: "revision must be a non-negative integer." };
  }
  let source: UpdateSource = "n8n";
  if (typeof input.source === "string") {
    if (!(UPDATE_SOURCES as readonly string[]).includes(input.source)) {
      return { ok: false, error: `source must be one of ${UPDATE_SOURCES.join(", ")}.` };
    }
    source = input.source as UpdateSource;
  }
  return {
    ok: true,
    meta: {
      packageId,
      revision,
      source,
      sensitiveFalse: input.sensitive === false,
      clearPending: input.clearPending === true,
    },
    body: input,
  };
}

function toneRevisionFrom(b: Fields, revision: number): number | null | undefined {
  if (b.toneCheckedRevision === null) return null;
  const n = num(b.toneCheckedRevision);
  if (n !== null && Number.isInteger(n)) return n;
  if (b.toneChecked === true) return revision; // sheet tone_checked TRUE for this revision
  if (b.toneChecked === false) return null;
  return undefined;
}

export type NormaliseResult = { ok: true; pkg: ContentPackage } | { ok: false; error: string };

function parseQaFlags(v: unknown): { ok: true; flags: QaFlag[] } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, flags: [] };
  if (!Array.isArray(v)) return { ok: false, error: "qaFlags must be an array." };
  const flags: QaFlag[] = [];
  for (const f of v) {
    if (!isObj(f) || !(QA_CHECKS as readonly string[]).includes(str(f.check))) {
      return { ok: false, error: `qaFlags[].check must be one of ${QA_CHECKS.join(", ")}.` };
    }
    flags.push({ check: f.check as QaFlag["check"], detail: str(f.detail).slice(0, 500) });
  }
  return { ok: true, flags };
}

/** Only http(s) or site-relative URLs are rendered. */
function safeUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const u = v.trim();
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

function parseScript(v: unknown): ContentPackage["script"] {
  const s = isObj(v) ? v : {};
  const out: ContentPackage["script"] = {
    hook: str(s.hook),
    narration: str(s.narration),
    scenes: Array.isArray(s.scenes) ? (s.scenes as ContentPackage["script"]["scenes"]) : [],
  };
  if (Array.isArray(s.youtubeTitleOptions)) {
    out.youtubeTitleOptions = s.youtubeTitleOptions
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .slice(0, 10);
  }
  if (typeof s.hookOverlay === "string") out.hookOverlay = s.hookOverlay;
  if (typeof s.openQuestion === "string") out.openQuestion = s.openQuestion;
  if (typeof s.coverFrameScene === "number" || typeof s.coverFrameScene === "string") {
    out.coverFrameScene = s.coverFrameScene;
  }
  return out;
}

/** Full package (new item or newer revision). */
export function normalisePackage(meta: InboundMeta, b: Fields): NormaliseResult {
  const status = contentStatus(b.status);
  if (!status) return { ok: false, error: `status must be one of ${CONTENT_STATUSES.join(", ")}.` };
  const subject = str(b.subject).trim();
  if (!subject) return { ok: false, error: "subject is required for a new package or a new revision." };

  const credibilityRaw = str(b.credibilityLabel).toUpperCase() as CredibilityLabel;
  const credibilityLabel: CredibilityLabel = CREDIBILITY_LABELS.includes(credibilityRaw)
    ? credibilityRaw
    : "FOLKLORE"; // weakest label when unsure (Verity rule 3)

  const rows = parsePlatforms(b.platforms, status);
  if (!rows.ok) return rows;

  const qa = parseQaFlags(b.qaFlags);
  if (!qa.ok) return qa;
  const video = isObj(b.video) ? (b.video as ContentPackage["video"]) : null;
  const tone = toneRevisionFrom(b, meta.revision);

  const pkg: ContentPackage = {
    packageId: meta.packageId,
    revision: meta.revision,
    status,
    subject,
    sheetRef: sheetRefFrom(b.sheetRef) ?? sheetRefFrom(b.source) ?? { tab: "Unknown tab", row: 0, sheetUrl: null },
    credibilityLabel,
    credibility: isObj(b.credibility) ? (b.credibility as ContentPackage["credibility"]) : undefined,
    aiIllustration: b.aiIllustration !== false,
    sensitive: b.sensitive === true,
    toneCheckedRevision: tone ?? null,
    blockedReason: typeof b.blockedReason === "string" ? b.blockedReason : null,
    video,
    script: parseScript(b.script),
    coverImageUrl: safeUrl(b.coverImageUrl),
    qaFlags: qa.flags,
    platforms: rows.rows,
    revisionCount: num(b.revisionCount, 0) ?? 0,
    revisionCap: num(b.revisionCap, DEFAULT_REVISION_CAP) ?? DEFAULT_REVISION_CAP,
    costEstimateGbp: num(b.costEstimateGbp),
    costActualGbp: num(b.costActualGbp),
    monthToDateGbp: num(b.monthToDateGbp),
    stageCostEstimatesGbp: isObj(b.stageCostEstimatesGbp)
      ? (b.stageCostEstimatesGbp as ContentPackage["stageCostEstimatesGbp"])
      : undefined,
    history: Array.isArray(b.history) ? (b.history as ContentHistoryEntry[]) : [],
    updatedAt: str(b.updatedAt) || new Date().toISOString(),
    lastSource: meta.source,
    lastSourceAt: new Date().toISOString(),
    pendingAction: null,
    example: b.example === true,
  };
  return { ok: true, pkg };
}

/**
 * Same-revision update (typically a sheet sync): only the fields present are
 * applied. Rows merge by platform id, so `{ platform, status }` is enough.
 */
export function mergeSameRevision(existing: ContentPackage, meta: InboundMeta, b: Fields): NormaliseResult {
  const next: ContentPackage = {
    ...existing,
    platforms: existing.platforms.map((p) => ({ ...p })),
    history: [...existing.history],
  };
  if (b.status !== undefined) {
    const st = contentStatus(b.status);
    if (!st) return { ok: false, error: `status must be one of ${CONTENT_STATUSES.join(", ")}.` };
    next.status = st;
  }
  if (b.platforms !== undefined) {
    const rows = parsePlatforms(
      (Array.isArray(b.platforms) ? b.platforms : []).map((p) =>
        isObj(p) && p.status === undefined
          ? { ...p, status: existing.platforms.find((x) => x.platform === p.platform)?.status }
          : p
      ),
      next.status
    );
    if (!rows.ok) return rows;
    for (const row of rows.rows) {
      const i = next.platforms.findIndex((p) => p.platform === row.platform);
      if (i >= 0) next.platforms[i] = { ...next.platforms[i], ...row } as PlatformCopy;
      else next.platforms.push(row);
    }
  }
  const simple: (keyof ContentPackage)[] = [
    "subject", "credibility", "aiIllustration", "blockedReason", "video",
    "revisionCount", "revisionCap", "costEstimateGbp", "costActualGbp", "monthToDateGbp",
    "stageCostEstimatesGbp", "history",
  ];
  for (const k of simple) {
    if (b[k] !== undefined) (next as unknown as Fields)[k] = b[k];
  }
  if (b.script !== undefined) next.script = parseScript(b.script);
  if (b.coverImageUrl !== undefined) next.coverImageUrl = safeUrl(b.coverImageUrl);
  if (b.qaFlags !== undefined) {
    const qa = parseQaFlags(b.qaFlags);
    if (!qa.ok) return qa;
    next.qaFlags = qa.flags;
  }
  if (b.credibilityLabel !== undefined) {
    const c = str(b.credibilityLabel).toUpperCase() as CredibilityLabel;
    next.credibilityLabel = CREDIBILITY_LABELS.includes(c) ? c : "FOLKLORE";
  }
  const ref = sheetRefFrom(b.sheetRef) ?? sheetRefFrom(b.source);
  if (ref) next.sheetRef = ref;
  if (b.sensitive === true) next.sensitive = true;
  const tone = toneRevisionFrom(b, meta.revision);
  if (tone !== undefined) next.toneCheckedRevision = tone;
  next.updatedAt = str(b.updatedAt) || new Date().toISOString();
  next.lastSource = meta.source;
  next.lastSourceAt = new Date().toISOString();
  return { ok: true, pkg: next };
}

export type UpsertResult =
  | { ok: true; pkg: ContentPackage; kind: "created" | "replaced" | "updated" }
  | { ok: false; status: number; error: string; current?: ContentPackage };

/**
 * Inbound POST rules: strictly older revision → 409; same revision → merge
 * (status / platform-status update); newer or unknown → full package.
 * `sensitive` can never be cleared from here; pendingAction clears once the
 * inbound state shows the action landed (or on clearPending / newer revision).
 */
export function applyInbound(existing: ContentPackage | null, meta: InboundMeta, body: Fields): UpsertResult {
  if (existing && meta.revision < existing.revision) {
    return {
      ok: false,
      status: 409,
      error: `Stale package: stored revision ${existing.revision} is newer than ${meta.revision}.`,
      current: existing,
    };
  }
  const same = Boolean(existing && existing.revision === meta.revision);
  const res = same ? mergeSameRevision(existing!, meta, body) : normalisePackage(meta, body);
  if (!res.ok) return { ok: false, status: 400, error: res.error };
  const pkg = res.pkg;

  if (existing) {
    if (existing.sensitive && (!pkg.sensitive || meta.sensitiveFalse)) {
      pkg.sensitive = true;
      if (meta.sensitiveFalse) {
        pkg.history = [
          ...pkg.history,
          {
            revision: pkg.revision,
            action: "note",
            stages: [],
            feedback: "sensitive flag change ignored",
            actor: meta.source,
            at: new Date().toISOString(),
          },
        ];
      }
    }
    // Keep example marker on seeded items that n8n/sheet updates in place.
    if (existing.example && body.example === undefined) pkg.example = true;
    if (same && existing.pendingAction) {
      pkg.pendingAction = meta.clearPending || pendingResolvedBy(existing, pkg) ? null : existing.pendingAction;
    }
  }
  return { ok: true, pkg, kind: !existing ? "created" : same ? "updated" : "replaced" };
}
