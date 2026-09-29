import type { ParkedBlocker } from "@/types";

/**
 * Parked blockers — contract (agreed with Spectre / automation):
 *
 * POST /api/agent-ops/status (same Bearer auth as the heartbeat) may add:
 *   parkBlocker:  { id, title, reason, since? }  upsert by id; server sets
 *                 `since` (ISO 8601 UTC) when absent; updates keep the
 *                 original `since`.
 *   clearBlocker: "<id>"                         remove; unknown id → 200.
 * A client-sent `parkedBlockers` array is ignored. Malformed → 400 and the
 * whole POST (heartbeat fields included) is rejected. 11th blocker → 409.
 *
 * Pure validation only — no I/O — so it can run before anything is written.
 */

export const PARKED_ID_RE = /^[a-z0-9-]{1,64}$/;
export const PARKED_TITLE_MAX = 120;
export const PARKED_REASON_MAX = 280;
export const PARKED_MAX_PER_AGENT = 10;

/** ISO 8601 date-time with an explicit zone (Z or ±HH:MM). */
const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/;

export type BlockerOp =
  | { type: "none" }
  | {
      type: "park";
      /** Validated blocker; `since` is absent when the server should set it */
      blocker: Omit<ParkedBlocker, "since"> & { since?: string };
    }
  | { type: "clear"; id: string };

export type ParseResult =
  | { ok: true; op: BlockerOp }
  | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Normalise an ISO 8601 string to UTC `toISOString()` form, or null. */
export function normaliseIsoUtc(raw: unknown): string | null {
  if (typeof raw !== "string" || !ISO_8601_RE.test(raw)) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

/**
 * Extract and validate the blocker op from a POST body. `null`/absent
 * `parkBlocker` / `clearBlocker` mean "no op". Sending both is rejected
 * (one blocker op per POST keeps each write a single atomic store op).
 */
export function parseBlockerOp(body: unknown): ParseResult {
  if (!isPlainObject(body)) return { ok: true, op: { type: "none" } };
  const park = body.parkBlocker;
  const clear = body.clearBlocker;
  const hasPark = park !== undefined && park !== null;
  const hasClear = clear !== undefined && clear !== null;

  if (hasPark && hasClear) {
    return {
      ok: false,
      error: "Send either parkBlocker or clearBlocker, not both",
    };
  }

  if (hasClear) {
    if (typeof clear !== "string" || !PARKED_ID_RE.test(clear)) {
      return {
        ok: false,
        error: "clearBlocker must be a blocker id matching ^[a-z0-9-]{1,64}$",
      };
    }
    return { ok: true, op: { type: "clear", id: clear } };
  }

  if (hasPark) {
    if (!isPlainObject(park)) {
      return { ok: false, error: "parkBlocker must be an object" };
    }
    const { id, title, reason, since } = park;
    if (typeof id !== "string" || !PARKED_ID_RE.test(id)) {
      return {
        ok: false,
        error: "parkBlocker.id must match ^[a-z0-9-]{1,64}$",
      };
    }
    if (
      typeof title !== "string" ||
      title.trim().length === 0 ||
      title.length > PARKED_TITLE_MAX
    ) {
      return {
        ok: false,
        error: `parkBlocker.title must be a non-empty string of at most ${PARKED_TITLE_MAX} characters`,
      };
    }
    if (typeof reason !== "string" || reason.length > PARKED_REASON_MAX) {
      return {
        ok: false,
        error: `parkBlocker.reason must be a string of at most ${PARKED_REASON_MAX} characters`,
      };
    }
    let sinceIso: string | undefined;
    if (since !== undefined && since !== null) {
      const n = normaliseIsoUtc(since);
      if (!n) {
        return {
          ok: false,
          error: "parkBlocker.since must be an ISO 8601 date-time with a zone",
        };
      }
      sinceIso = n;
    }
    return {
      ok: true,
      op: {
        type: "park",
        blocker: {
          id,
          title: title.trim(),
          reason: reason.trim(),
          ...(sinceIso ? { since: sinceIso } : {}),
        },
      },
    };
  }

  return { ok: true, op: { type: "none" } };
}

/** Keys that identify the agent rather than carry heartbeat state. */
const NON_HEARTBEAT_KEYS = new Set([
  "agentId",
  "agentName",
  "name",
  "slug",
  "parkBlocker",
  "clearBlocker",
  "parkedBlockers",
]);

/**
 * True when the body carries any heartbeat field. A blocker-only POST
 * (identity + parkBlocker/clearBlocker) must not reset the live row to idle.
 */
export function hasHeartbeatFields(body: unknown): boolean {
  if (!isPlainObject(body)) return true;
  return Object.keys(body).some((k) => !NON_HEARTBEAT_KEYS.has(k));
}

/** Oldest first, then id — stable order for cards / Needs you. */
export function sortBlockers(list: ParkedBlocker[]): ParkedBlocker[] {
  return [...list].sort((a, b) => {
    const d = Date.parse(a.since) - Date.parse(b.since);
    if (d !== 0 && Number.isFinite(d)) return d;
    return a.id.localeCompare(b.id);
  });
}

/** Defensive read of a stored/remote value into a blocker (or null). */
export function coerceBlocker(raw: unknown): ParkedBlocker | null {
  if (!isPlainObject(raw)) return null;
  const { id, title, reason, since } = raw;
  if (typeof id !== "string" || typeof title !== "string") return null;
  return {
    id,
    title,
    reason: typeof reason === "string" ? reason : "",
    since: typeof since === "string" ? since : new Date(0).toISOString(),
  };
}

/** "2d 3h" / "3h 12m" / "5m" / "<1m" */
export function formatWaitingDuration(ms: number): string {
  const mins = Math.floor(Math.max(0, ms) / 60_000);
  if (mins < 1) return "<1m";
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  return `${m}m`;
}
