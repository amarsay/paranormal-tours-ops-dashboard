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

/**
 * Strict ISO 8601 UTC date-time: YYYY-MM-DDTHH:MM[:SS[.fraction]]Z.
 * Only the `Z` designator is accepted (no offsets, no date-only forms).
 */
const ISO_8601_UTC_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?Z$/;

/** A client `since` may be at most this far ahead of the server clock. */
export const SINCE_MAX_FUTURE_SKEW_MS = 120_000;

export type BlockerOp =
  | { type: "none" }
  | {
      type: "park";
      /** Validated blocker; `since` is absent when the server should set it */
      blocker: Omit<ParkedBlocker, "since"> & { since?: string };
    }
  | { type: "clear"; id: string };

/** Machine-readable error codes (returned as `code` alongside `error`). */
export type BlockerErrorCode =
  | "invalid_blocker"
  | "invalid_since"
  | "since_in_future"
  | "no_live_row"
  | "blocker_limit";

export type ParseResult =
  | { ok: true; op: BlockerOp }
  | { ok: false; code: BlockerErrorCode; error: string };

/**
 * Length in Unicode code points (not UTF-16 units), so an emoji counts as 1
 * (a ZWJ sequence such as 👨‍👩‍👧 still counts as its 5 code points).
 */
export function codePointLength(s: string): number {
  return Array.from(s).length;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Parse a strict ISO 8601 UTC string (see ISO_8601_UTC_RE) that names a real
 * calendar date/time — 2026-02-30, 2026-13-01, 25:00, :60 are rejected rather
 * than rolled over. Returns the canonical `toISOString()` form, or null.
 */
export function normaliseIsoUtc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = ISO_8601_UTC_RE.exec(raw);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1, 6).map(Number) as [
    number, number, number, number, number,
  ];
  const second = m[6] ? Number(m[6]) : 0;
  if (year < 1970) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const ms = m[7] ? Math.floor(Number(`0${m[7]}`) * 1000) : 0;
  const t = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Extract and validate the blocker op from a POST body. `null`/absent
 * `parkBlocker` / `clearBlocker` mean "no op". Sending both is rejected
 * (one blocker op per POST keeps each write a single atomic store op).
 */
export function parseBlockerOp(
  body: unknown,
  nowMs: number = Date.now()
): ParseResult {
  if (!isPlainObject(body)) return { ok: true, op: { type: "none" } };
  const park = body.parkBlocker;
  const clear = body.clearBlocker;
  const hasPark = park !== undefined && park !== null;
  const hasClear = clear !== undefined && clear !== null;

  if (hasPark && hasClear) {
    return {
      ok: false,
      code: "invalid_blocker",
      error: "Send either parkBlocker or clearBlocker, not both",
    };
  }

  if (hasClear) {
    if (typeof clear !== "string" || !PARKED_ID_RE.test(clear)) {
      return {
        ok: false,
        code: "invalid_blocker",
        error: "clearBlocker must be a blocker id matching ^[a-z0-9-]{1,64}$",
      };
    }
    return { ok: true, op: { type: "clear", id: clear } };
  }

  if (hasPark) {
    if (!isPlainObject(park)) {
      return {
        ok: false,
        code: "invalid_blocker",
        error: "parkBlocker must be an object",
      };
    }
    const { id, title, reason, since } = park;
    const bad = (error: string): ParseResult => ({
      ok: false,
      code: "invalid_blocker",
      error,
    });
    if (typeof id !== "string" || !PARKED_ID_RE.test(id)) {
      return bad("parkBlocker.id must match ^[a-z0-9-]{1,64}$");
    }
    // Lengths are Unicode code points of the trimmed string.
    const titleTrim = typeof title === "string" ? title.trim() : "";
    if (
      typeof title !== "string" ||
      titleTrim.length === 0 ||
      codePointLength(titleTrim) > PARKED_TITLE_MAX
    ) {
      return bad(
        `parkBlocker.title must be a non-empty string of at most ${PARKED_TITLE_MAX} characters (Unicode code points, after trimming)`
      );
    }
    const reasonTrim = typeof reason === "string" ? reason.trim() : "";
    if (typeof reason !== "string" || codePointLength(reasonTrim) > PARKED_REASON_MAX) {
      return bad(
        `parkBlocker.reason must be a string of at most ${PARKED_REASON_MAX} characters (Unicode code points, after trimming)`
      );
    }
    let sinceIso: string | undefined;
    if (since !== undefined && since !== null) {
      const n = normaliseIsoUtc(since);
      if (!n) {
        return {
          ok: false,
          code: "invalid_since",
          error:
            "parkBlocker.since must be a real ISO 8601 UTC date-time, e.g. 2026-09-29T08:15:00Z",
        };
      }
      if (Date.parse(n) > nowMs + SINCE_MAX_FUTURE_SKEW_MS) {
        return {
          ok: false,
          code: "since_in_future",
          error: `parkBlocker.since is in the future (more than ${SINCE_MAX_FUTURE_SKEW_MS / 1000}s ahead of the server clock)`,
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
          title: titleTrim,
          reason: reasonTrim,
          ...(sinceIso ? { since: sinceIso } : {}),
        },
      },
    };
  }

  return { ok: true, op: { type: "none" } };
}

/**
 * Heartbeat fields a POST may carry (anything else — identity, blocker
 * actions, unknown keys — is not a heartbeat field).
 */
export const HEARTBEAT_KEYS = [
  "status",
  "presence",
  "taskTitle",
  "currentTask",
  "notes",
  "message",
  "correlationId",
  "handoffTo",
  "blockerReason",
  "taskState",
  "taskStatus",
  "heartbeatAt",
  "updatedAt",
  "at",
  "taskId",
] as const;

/** True when the body carries at least one heartbeat field. */
export function hasHeartbeatFields(body: unknown): boolean {
  if (!isPlainObject(body)) return false;
  return HEARTBEAT_KEYS.some((k) => Object.prototype.hasOwnProperty.call(body, k));
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
