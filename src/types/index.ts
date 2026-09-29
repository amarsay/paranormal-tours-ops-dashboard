export type AgentStatus = "idle" | "working" | "blocked" | "review";

/** Primary chips + derived / secondary presence for styling */
export type PresenceStatus =
  | AgentStatus
  | "done"
  | "failed"
  | "stale"
  | "offline";

export type TaskStatus =
  | "backlog"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "failed";

export type CodexStatus =
  | "submitted"
  | "in_review"
  | "published"
  | "rejected";

/**
 * A blocker the agent has parked so it can move on to other work. Lives
 * alongside (not instead of) the live status/task.
 */
export interface ParkedBlocker {
  /** Slug, ^[a-z0-9-]{1,64}$ — upsert key */
  id: string;
  title: string;
  reason: string;
  /** ISO 8601 UTC — when the blocker was first parked */
  since: string;
}

export interface Agent {
  id: string;
  name: string;
  displayName: string;
  role: string;
  squad: string;
  status: AgentStatus;
  /** Derived display presence (stale/offline/done/failed overlay) */
  presence?: PresenceStatus;
  currentTask: string | null;
  lastUpdate: string | null;
  /** Last heartbeat from live snapshot (ISO) */
  heartbeatAt?: string | null;
  blockerReason?: string | null;
  notes: string[];
  externalId?: string;
  correlationId?: string | null;
  handoffTo?: string | null;
  taskId?: string | null;
  taskState?: TaskStatus | null;
  /** Live sync overlay applied */
  live?: boolean;
  /** Parked blockers from the live snapshot (absent → none) */
  parkedBlockers?: ParkedBlocker[];
}

export interface Task {
  id: string;
  title: string;
  agentName: string;
  agentId: string;
  status: TaskStatus;
  notes: string;
  updatedAt: string;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  message: string;
  agentName?: string;
  at: string;
}

export interface CodexEntry {
  id: string;
  title: string;
  place: string;
  claimType: string;
  status: CodexStatus;
  evidenceGrade: string;
  assignee: string;
  updatedAt: string;
}

export interface RosterSeed {
  brand: string;
  product: string;
  agents: Array<{
    name: string;
    displayName: string;
    role: string;
    status: AgentStatus;
    currentTask: string | null;
    lastUpdate: string | null;
    squad: string;
  }>;
}

export interface OpsState {
  agents: Agent[];
  tasks: Task[];
  activity: ActivityItem[];
  codex: CodexEntry[];
  hydrated: boolean;
  liveSync: LiveSyncState;
}

export type LiveSyncMode =
  | "live"
  | "polling"
  | "reconnecting"
  | "offline"
  | "idle";

export interface LiveSyncState {
  mode: LiveSyncMode;
  /** ISO time of the last successful poll (client clock) */
  lastFetchAt: string | null;
  storage: "redis" | "memory" | null;
  error: string | null;
  schemaVersion: number | null;
  /** Failed polls since the last success (offline after 3) */
  consecutiveFailures: number;
  /** Server clock (ms) of the last good snapshot — staleness reference */
  snapshotAt: number | null;
  /** Client Date.now() when the last good snapshot arrived */
  receivedAt: number | null;
  /** True while waiting on a first / visibility refetch: no stale marking */
  suppressStale: boolean;
}
