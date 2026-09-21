import type {
  Agent,
  CodexEntry,
  RosterSeed,
  Task,
} from "@/types";
import { toSlug } from "./slug";

export function seedAgents(roster: RosterSeed): Agent[] {
  return roster.agents.map((a) => ({
    id: toSlug(a.name),
    name: a.name,
    displayName: a.displayName,
    role: a.role,
    squad: a.squad,
    status: a.status,
    currentTask: a.currentTask,
    lastUpdate: a.lastUpdate,
    notes: [],
  }));
}

export function seedDemoTasks(agents: Agent[]): Task[] {
  const now = new Date().toISOString();
  const picks: Array<{
    agent: string;
    title: string;
    status: Task["status"];
  }> = [
    {
      agent: "verity",
      title: "Review Pendle Hill witness cluster",
      status: "in_progress",
    },
    {
      agent: "atlas",
      title: "Normalise taxonomy tags for UK hauntings",
      status: "review",
    },
    {
      agent: "sally",
      title: "Draft September tour teaser carousel",
      status: "backlog",
    },
    {
      agent: "billy",
      title: "Ship Codex Ignota landing polish",
      status: "done",
    },
  ];

  return picks
    .map((p, i) => {
      const agent = agents.find((a) => a.id === p.agent);
      if (!agent) return null;
      return {
        id: `seed-task-${i + 1}`,
        title: p.title,
        agentName: agent.name,
        agentId: agent.id,
        status: p.status,
        notes: "",
        updatedAt: now,
        createdAt: now,
      } satisfies Task;
    })
    .filter(Boolean) as Task[];
}

export function applySeedTaskStatuses(
  agents: Agent[],
  tasks: Task[]
): Agent[] {
  const byAgent = new Map(tasks.map((t) => [t.agentId, t]));
  return agents.map((agent) => {
    const task = byAgent.get(agent.id);
    if (!task) return agent;
    const status =
      task.status === "done"
        ? "idle"
        : task.status === "review"
          ? "review"
          : task.status === "in_progress"
            ? "working"
            : "idle";
    return {
      ...agent,
      status: status as Agent["status"],
      currentTask: task.status === "done" ? null : task.title,
      lastUpdate: task.updatedAt,
    };
  });
}

export function seedCodex(): CodexEntry[] {
  const now = new Date().toISOString();
  return [
    {
      id: "cx-1",
      title: "Grey Lady of Hampton Court",
      place: "Hampton Court Palace, Surrey",
      claimType: "Apparition",
      status: "in_review",
      evidenceGrade: "B",
      assignee: "Verity",
      updatedAt: now,
    },
    {
      id: "cx-2",
      title: "Borley Rectory bell phenomenon",
      place: "Borley, Essex",
      claimType: "Auditory",
      status: "submitted",
      evidenceGrade: "C",
      assignee: "Atlas",
      updatedAt: now,
    },
    {
      id: "cx-3",
      title: "Tower of London raven omen cluster",
      place: "Tower of London",
      claimType: "Folklore / omen",
      status: "published",
      evidenceGrade: "A",
      assignee: "Verity",
      updatedAt: now,
    },
    {
      id: "cx-4",
      title: "Pluckley village multi-site claims",
      place: "Pluckley, Kent",
      claimType: "Composite site",
      status: "rejected",
      evidenceGrade: "D",
      assignee: "Atlas",
      updatedAt: now,
    },
    {
      id: "cx-5",
      title: "Edinburgh Vaults cold-spot survey",
      place: "South Bridge Vaults, Edinburgh",
      claimType: "Environmental",
      status: "submitted",
      evidenceGrade: "B",
      assignee: "Verity",
      updatedAt: now,
    },
    {
      id: "cx-6",
      title: "Chillingham Castle prisoner echo",
      place: "Chillingham, Northumberland",
      claimType: "Apparition",
      status: "in_review",
      evidenceGrade: "B",
      assignee: "Atlas",
      updatedAt: now,
    },
  ];
}

export const STORAGE_KEY = "pt-agent-ops-v1";

export const SQUADS = [
  "Growth & Revenue",
  "Platform & Codex",
  "Ops & Trust",
  "Content & Audience",
] as const;
