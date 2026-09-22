import type { Agent, AgentStatus, PresenceStatus } from "@/types";
import { FRESHNESS } from "./live-types";

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
 * Derive display presence from primary status + heartbeat age.
 * Agent chips key off write status (idle|working|blocked|review).
 * done/failed live on taskState; stale/offline from heartbeat age.
 * Brief done/failed pulse only when presence is explicitly set and status is idle.
 */
export function derivePresence(agent: Agent, now = Date.now()): PresenceStatus {
  const beat = agentBeatAt(agent);
  if (beat == null) {
    // Never checked in via live → offline only when we expect live overlay
    return agent.live ? "offline" : agent.status;
  }

  const age = now - beat;
  const active = isActiveStatus(agent.status);
  const staleLimit = active ? FRESHNESS.staleActiveMs : FRESHNESS.staleIdleMs;
  if (age > staleLimit) return "stale";

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

export function isLiveDot(agent: Agent, now = Date.now()): boolean {
  const beat = agentBeatAt(agent);
  if (beat == null) return false;
  const age = now - beat;
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
