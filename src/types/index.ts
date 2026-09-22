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

export type LiveSyncMode = "live" | "polling" | "offline" | "idle";

export interface LiveSyncState {
  mode: LiveSyncMode;
  lastFetchAt: string | null;
  storage: "redis" | "memory" | null;
  error: string | null;
  schemaVersion: number | null;
}
