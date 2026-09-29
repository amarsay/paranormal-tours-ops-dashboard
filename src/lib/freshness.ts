import type { Agent, AgentStatus, PresenceStatus } from "@/types";
import { FRESHNESS } from "./live-types";
import { formatWaitingDuration } from "./parked-blockers";

function isActiveStatus(status: AgentStatus): boolean {
  return status === "working" || status === "blocked" || status === "review";
}

function isWriteChip(status: AgentStatus): boolean {
  return (
    status === "idle" ||
    status === "working" ||
    status === "blocked" ||
    status === "review"
  );
}

/** Pick best timestamp for freshness (heartbeat preferred). */
export function agentBeatAt(agent: Agent): number | null {
  const iso = agent.heartbeatAt || agent.lastUpdate;
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Reference clock for freshness. Staleness is measured against the time of
 * the last good snapshot, not the browser's render-time clock, so a throttled
 * background tab (or a missed poll) can't age cards past their threshold.
 */
export interface FreshnessRef {
  /** Server clock (ms) of the last good snapshot; null before first sync. */
  snapshotAt: number | null;
  /** Client Date.now() when that snapshot arrived. */
  receivedAt: number | null;
  /** Waiting on a first / visibility refetch — never mark stale/offline. */
  suppressStale: boolean;
  /**
   * Truly offline (3+ failed polls). Relative "Updated Xs ago" text would
   * imply freshness, so agent times are shown as a UK clock time instead.
   */
  offline?: boolean;
}

/**
 * "Updated Xs ago" text may tick forward between polls, but only this far past
 * the snapshot. Staleness itself never uses the tick.
 */
export const DISPLAY_TICK_CAP_MS = 10_000;

function snapshotNow(ref: FreshnessRef | undefined, now: number): number {
  // Before the first snapshot this session there is nothing better than the
  // local clock (seed / localStorage agents only).
  return ref?.snapshotAt ?? now;
}

/** Agent age relative to the snapshot (snapshot time − heartbeat), ≥ 0. */
export function agentAgeMs(
  agent: Agent,
  ref?: FreshnessRef,
  now = Date.now()
): number | null {
  const beat = agentBeatAt(agent);
  if (beat == null) return null;
  return Math.max(0, snapshotNow(ref, now) - beat);
}

/**
 * Clock for display-only relative times: snapshot time plus client time
 * elapsed since it arrived, capped at DISPLAY_TICK_CAP_MS.
 */
export function displayNow(ref: FreshnessRef | undefined, now = Date.now()): number {
  if (ref?.snapshotAt == null || ref.receivedAt == null) return now;
  const elapsed = Math.min(
    Math.max(0, now - ref.receivedAt),
    DISPLAY_TICK_CAP_MS
  );
  return ref.snapshotAt + elapsed;
}

/**
 * Derive display presence from primary status + heartbeat age.
 * Agent chips key off write status (idle|working|blocked|review).
 * done/failed live on taskState; stale/offline from heartbeat age
 * (measured against the snapshot — see FreshnessRef).
 * Brief done/failed pulse only when presence is explicitly set and status is idle.
 */
export function derivePresence(
  agent: Agent,
  ref?: FreshnessRef,
  now = Date.now()
): PresenceStatus {
  const suppress = ref?.suppressStale ?? false;
  const age = agentAgeMs(agent, ref, now);
  if (age == null) {
    // Never checked in via live → offline only when we expect live overlay
    return agent.live && !suppress ? "offline" : agent.status;
  }

  const active = isActiveStatus(agent.status);
  const staleLimit = active ? FRESHNESS.staleActiveMs : FRESHNESS.staleIdleMs;
  if (!suppress && age > staleLimit) return "stale";

  // When status is a write chip, chips follow status (blocked/review still surface).
  if (isWriteChip(agent.status)) {
    if (agent.status === "idle") {
      const raw = agent.presence as PresenceStatus | undefined;
      if (raw === "failed") return "failed";
      if (raw === "done" && age < FRESHNESS.donePulseMs) return "done";
    }
    return agent.status;
  }

  return agent.status;
}

export function isLiveDot(
  agent: Agent,
  ref?: FreshnessRef,
  now = Date.now()
): boolean {
  const age = agentAgeMs(agent, ref, now);
  if (age == null) return false;
  const active = isActiveStatus(agent.status);
  return age <= (active ? FRESHNESS.liveActiveMs : FRESHNESS.liveIdleMs);
}

export function formatUpdatedAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "Waiting for first heartbeat";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Waiting for first heartbeat";
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 5) return "Updated just now";
  if (sec < 60) return `Updated ${sec}s ago`;
  const mins = Math.floor(sec / 60);
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

/**
 * UK clock time (Europe/London) — "18:42", or "27 Sep, 18:42" when not today
 * in London.
 */
export function formatLondonClock(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  if (londonDayKey(d) === londonDayKey(new Date(now))) return time;
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
  }).format(d);
  return `${day}, ${time}`;
}

/**
 * Card "Updated …" line. Live: relative to the snapshot (capped tick).
 * Truly offline: the heartbeat's UK clock time, so nothing implies freshness.
 */
export function formatAgentUpdated(
  agent: Agent,
  ref?: FreshnessRef,
  now = Date.now()
): string {
  const iso = agent.heartbeatAt || agent.lastUpdate;
  if (ref?.offline && iso) {
    const t = new Date(iso).getTime();
    if (Number.isFinite(t)) return `Updated at ${formatLondonClock(t, now)}`;
  }
  return formatUpdatedAgo(iso, displayNow(ref, now));
}

/** Europe/London calendar day key for "done today" */
export function londonDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function isSameLondonDay(iso: string, now = new Date()): boolean {
  try {
    return londonDayKey(new Date(iso)) === londonDayKey(now);
  } catch {
    return false;
  }
}

/**
 * How long a parked blocker has been waiting, measured against the snapshot
 * clock (same reference as staleness), not render-time Date.now(). ≥ 0.
 */
export function parkedWaitingMs(
  sinceIso: string,
  ref?: FreshnessRef,
  now = Date.now()
): number {
  const since = Date.parse(sinceIso);
  if (!Number.isFinite(since)) return 0;
  return Math.max(0, snapshotNow(ref, now) - since);
}

/** "waiting 2d 3h" */
export function formatParkedWaiting(
  sinceIso: string,
  ref?: FreshnessRef,
  now = Date.now()
): string {
  return `waiting ${formatWaitingDuration(parkedWaitingMs(sinceIso, ref, now))}`;
}
