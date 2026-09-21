"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  ActivityItem,
  AgentStatus,
  CodexStatus,
  OpsState,
  RosterSeed,
  Task,
  TaskStatus,
} from "@/types";
import {
  STORAGE_KEY,
  applySeedTaskStatuses,
  seedAgents,
  seedCodex,
  seedDemoTasks,
} from "./seed";

interface OpsContextValue extends OpsState {
  assignTask: (agentId: string, title: string, notes?: string) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  addAgentNote: (agentId: string, note: string) => void;
  updateCodexStatus: (entryId: string, status: CodexStatus) => void;
  resetDemo: () => void;
}

const OpsContext = createContext<OpsContextValue | null>(null);

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function pushActivity(
  activity: ActivityItem[],
  message: string,
  agentName?: string
): ActivityItem[] {
  return [
    {
      id: uid("act"),
      message,
      agentName,
      at: new Date().toISOString(),
    },
    ...activity,
  ].slice(0, 80);
}

function buildInitial(roster: RosterSeed): Omit<OpsState, "hydrated"> {
  const baseAgents = seedAgents(roster);
  const tasks = seedDemoTasks(baseAgents);
  const agents = applySeedTaskStatuses(baseAgents, tasks);
  const activity: ActivityItem[] = [
    {
      id: "act-seed-1",
      message: "Dashboard seeded with 31 specialist agents.",
      at: new Date().toISOString(),
    },
    {
      id: "act-seed-2",
      message: "Demo board cards loaded for Verity, Atlas, Sally and Billy.",
      at: new Date().toISOString(),
    },
  ];
  return {
    agents,
    tasks,
    activity,
    codex: seedCodex(),
  };
}

export function OpsProvider({
  children,
  roster,
}: {
  children: React.ReactNode;
  roster: RosterSeed;
}) {
  const [state, setState] = useState<OpsState>(() => ({
    ...buildInitial(roster),
    hydrated: false,
  }));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Omit<OpsState, "hydrated">;
        if (parsed.agents?.length === 31) {
          setState({ ...parsed, hydrated: true });
          return;
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setState((s) => ({ ...s, hydrated: true }));
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const persist = {
      agents: state.agents,
      tasks: state.tasks,
      activity: state.activity,
      codex: state.codex,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
  }, [state]);

  const assignTask = useCallback((agentId: string, title: string, notes = "") => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setState((prev) => {
      const agent = prev.agents.find((a) => a.id === agentId);
      if (!agent) return prev;
      const now = new Date().toISOString();
      const task: Task = {
        id: uid("task"),
        title: trimmed,
        agentName: agent.name,
        agentId: agent.id,
        status: "in_progress",
        notes: notes.trim(),
        updatedAt: now,
        createdAt: now,
      };
      const agents = prev.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              status: "working" as AgentStatus,
              currentTask: trimmed,
              lastUpdate: now,
            }
          : a
      );
      return {
        ...prev,
        agents,
        tasks: [task, ...prev.tasks],
        activity: pushActivity(
          prev.activity,
          `Assigned “${trimmed}” — now working.`,
          agent.name
        ),
      };
    });
  }, []);

  const updateTaskStatus = useCallback((taskId: string, status: TaskStatus) => {
    setState((prev) => {
      const task = prev.tasks.find((t) => t.id === taskId);
      if (!task) return prev;
      const now = new Date().toISOString();
      const tasks = prev.tasks.map((t) =>
        t.id === taskId ? { ...t, status, updatedAt: now } : t
      );

      let agentStatus: AgentStatus = "working";
      let currentTask: string | null = task.title;
      if (status === "done") {
        agentStatus = "idle";
        currentTask = null;
      } else if (status === "review") {
        agentStatus = "review";
      } else if (status === "backlog") {
        agentStatus = "idle";
        currentTask = null;
      } else {
        agentStatus = "working";
      }

      const agents = prev.agents.map((a) =>
        a.id === task.agentId
          ? { ...a, status: agentStatus, currentTask, lastUpdate: now }
          : a
      );

      const label =
        status === "done"
          ? "completed"
          : status === "review"
            ? "moved to review"
            : status === "backlog"
              ? "returned to backlog"
              : "set in progress";

      return {
        ...prev,
        agents,
        tasks,
        activity: pushActivity(
          prev.activity,
          `Task “${task.title}” ${label}.`,
          task.agentName
        ),
      };
    });
  }, []);

  const setAgentStatus = useCallback(
    (agentId: string, status: AgentStatus) => {
      setState((prev) => {
        const agent = prev.agents.find((a) => a.id === agentId);
        if (!agent) return prev;
        const now = new Date().toISOString();
        const agents = prev.agents.map((a) =>
          a.id === agentId
            ? {
                ...a,
                status,
                lastUpdate: now,
                currentTask:
                  status === "idle" ? null : a.currentTask,
              }
            : a
        );
        return {
          ...prev,
          agents,
          activity: pushActivity(
            prev.activity,
            `Status marked ${status}.`,
            agent.name
          ),
        };
      });
    },
    []
  );

  const addAgentNote = useCallback((agentId: string, note: string) => {
    const trimmed = note.trim();
    if (!trimmed) return;
    setState((prev) => {
      const agent = prev.agents.find((a) => a.id === agentId);
      if (!agent) return prev;
      const now = new Date().toISOString();
      const agents = prev.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              notes: [trimmed, ...a.notes].slice(0, 40),
              lastUpdate: now,
            }
          : a
      );
      return {
        ...prev,
        agents,
        activity: pushActivity(
          prev.activity,
          `Briefing note stored: “${trimmed.slice(0, 72)}${
            trimmed.length > 72 ? "…" : ""
          }”`,
          agent.name
        ),
      };
    });
  }, []);

  const updateCodexStatus = useCallback(
    (entryId: string, status: CodexStatus) => {
      setState((prev) => {
        const entry = prev.codex.find((c) => c.id === entryId);
        if (!entry) return prev;
        const now = new Date().toISOString();
        const codex = prev.codex.map((c) =>
          c.id === entryId ? { ...c, status, updatedAt: now } : c
        );
        return {
          ...prev,
          codex,
          activity: pushActivity(
            prev.activity,
            `Codex entry “${entry.title}” → ${status.replace("_", " ")}.`,
            entry.assignee
          ),
        };
      });
    },
    []
  );

  const resetDemo = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ ...buildInitial(roster), hydrated: true });
  }, [roster]);

  const value = useMemo(
    () => ({
      ...state,
      assignTask,
      updateTaskStatus,
      setAgentStatus,
      addAgentNote,
      updateCodexStatus,
      resetDemo,
    }),
    [
      state,
      assignTask,
      updateTaskStatus,
      setAgentStatus,
      addAgentNote,
      updateCodexStatus,
      resetDemo,
    ]
  );

  return <OpsContext.Provider value={value}>{children}</OpsContext.Provider>;
}

export function useOps() {
  const ctx = useContext(OpsContext);
  if (!ctx) throw new Error("useOps must be used within OpsProvider");
  return ctx;
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
