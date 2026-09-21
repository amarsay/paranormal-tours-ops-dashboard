export type AgentStatus = "idle" | "working" | "blocked" | "review";

export type TaskStatus = "backlog" | "in_progress" | "review" | "done";

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
  currentTask: string | null;
  lastUpdate: string | null;
  notes: string[];
  externalId?: string;
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
}
