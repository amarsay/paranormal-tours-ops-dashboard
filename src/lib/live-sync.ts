import type { LiveSyncState } from "@/types";

/**
 * Pure live-sync state machine for the 5s status poll.
 *
 * - A single failed poll never flips the board: we keep rendering the last
 *   good snapshot and only show "reconnecting" until OFFLINE_AFTER_FAILURES
 *   consecutive failures.
 * - Each successful poll records a snapshot clock (server response time +
 *   client receive time) so agent staleness is measured against the snapshot,
 *   not against the browser's render-time clock.
 * - Returning to a visible tab suppresses stale/offline marking until the
 *   immediate refetch resolves.
 */

export const POLL_MS = 5_000;
/** Consecutive failed polls before the board is marked offline. */
export const OFFLINE_AFTER_FAILURES = 3;
/** Abort a poll that hangs this long (counts as one failure). */
export const POLL_TIMEOUT_MS = 8_000;

export const DEFAULT_LIVE_SYNC: LiveSyncState = {
  mode: "idle",
  lastFetchAt: null,
  storage: null,
  error: null,
  schemaVersion: null,
  consecutiveFailures: 0,
  snapshotAt: null,
  receivedAt: null,
  // Nothing has been fetched this session yet — don't mark persisted cards
  // stale/offline until the first poll resolves.
  suppressStale: true,
};

export type LiveSyncEvent =
  | { type: "poll-start" }
  | {
      type: "poll-success";
      /** Client Date.now() when the response body was read. */
      receivedAt: number;
      /** Server clock for this snapshot (ms since epoch). */
      snapshotAt: number;
      storage: LiveSyncState["storage"];
      schemaVersion: number | null;
    }
  | { type: "poll-failure"; error: string }
  | { type: "visible" };

export function reduceLiveSync(
  state: LiveSyncState,
  event: LiveSyncEvent
): LiveSyncState {
  switch (event.type) {
    case "poll-start":
      // Only the very first poll shows "polling"; afterwards the indicator
      // stays put so it doesn't blink every 5s.
      return state.mode === "idle" ? { ...state, mode: "polling" } : state;

    case "poll-success":
      return {
        ...state,
        mode: "live",
        lastFetchAt: new Date(event.receivedAt).toISOString(),
        storage: event.storage,
        error: null,
        schemaVersion: event.schemaVersion,
        consecutiveFailures: 0,
        snapshotAt: event.snapshotAt,
        receivedAt: event.receivedAt,
        suppressStale: false,
      };

    case "poll-failure": {
      const consecutiveFailures = state.consecutiveFailures + 1;
      const hasSnapshot = state.receivedAt != null;
      let mode: LiveSyncState["mode"];
      if (consecutiveFailures >= OFFLINE_AFTER_FAILURES) mode = "offline";
      else mode = hasSnapshot ? "reconnecting" : "polling";
      return {
        ...state,
        mode,
        error: event.error,
        consecutiveFailures,
        // The (re)fetch resolved — stop suppressing. Staleness is still
        // measured against the last good snapshot, so a failure alone can't
        // age cards past their threshold.
        suppressStale: false,
      };
    }

    case "visible":
      return {
        ...state,
        // Don't show "Offline" while the immediate refetch is in flight.
        mode: state.mode === "offline" ? "reconnecting" : state.mode,
        suppressStale: true,
      };

    default:
      return state;
  }
}

/**
 * Server-side clock for a snapshot: the HTTP Date header (server response
 * time) when present, else the client fetch-completed time. Never earlier
 * than the payload's own `updatedAt` (last write on the server).
 */
export function resolveSnapshotAt(opts: {
  dateHeader: string | null | undefined;
  payloadUpdatedAt: string | null | undefined;
  receivedAt: number;
}): number {
  const header = opts.dateHeader ? Date.parse(opts.dateHeader) : NaN;
  const base = Number.isFinite(header) ? header : opts.receivedAt;
  const updated = opts.payloadUpdatedAt ? Date.parse(opts.payloadUpdatedAt) : NaN;
  return Number.isFinite(updated) ? Math.max(base, updated) : base;
}

export function formatSyncedAgo(
  receivedAt: number | null,
  now = Date.now()
): string {
  if (receivedAt == null) return "Not synced yet";
  const sec = Math.max(0, Math.floor((now - receivedAt) / 1000));
  if (sec < 60) return `Last synced ${sec}s ago`;
  const mins = Math.floor(sec / 60);
  if (mins < 60) return `Last synced ${mins}m ago`;
  return `Last synced ${Math.floor(mins / 60)}h ago`;
}
