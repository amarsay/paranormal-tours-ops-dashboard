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
  Agent,
  AgentStatus,
  CodexStatus,
  LiveSyncState,
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
import type { AgentOpsSnapshot } from "./live-types";
import { normaliseTaskState } from "./live-types";

interface OpsContextValue extends OpsState {
  assignTask: (agentId: string, title: string, notes?: string) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  addAgentNote: (agentId: string, note: string) => void;
  updateCodexStatus: (entryId: string, status: CodexStatus) => void;
  resetDemo: () => void;
  applyLiveSnapshot: (snap: AgentOpsSnapshot) => void;
  setLiveSync: (patch: Partial<LiveSyncState>) => void;
}

const DEFAULT_LIVE: LiveSyncState = {
  mode: "idle",
  lastFetchAt: null,
  storage: null,
  error: null,
  schemaVersion: null,
};

const POLL_MS = 5000;

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
    liveSync: { ...DEFAULT_LIVE },
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
          setState({
            ...parsed,
            liveSync: { ...DEFAULT_LIVE },
            hydrated: true,
          });
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
  }, [state.hydrated, state.agents, state.tasks, state.activity, state.codex]);

  const applyLiveSnapshot = useCallback((snap: AgentOpsSnapshot) => {
    setState((prev) => {
      const rows = Object.values(snap.agents || {});
      if (rows.length === 0) {
        return {
          ...prev,
          liveSync: {
            ...prev.liveSync,
            mode: "live",
            lastFetchAt: new Date().toISOString(),
            storage: snap.storage,
            error: null,
            schemaVersion: snap.schemaVersion,
          },
        };
      }

      const byId = new Map(rows.map((r) => [r.agentId, r]));
      const agents: Agent[] = prev.agents.map((a) => {
        const row = byId.get(a.id);
        if (!row) return a;
        const taskState = normaliseTaskState(row.taskState);
        return {
          ...a,
          status: row.status,
          presence: (row.presence as Agent["presence"]) || row.status,
          currentTask: row.taskTitle,
          lastUpdate: row.updatedAt,
          heartbeatAt: row.heartbeatAt || row.updatedAt,
          blockerReason: row.blockerReason ?? null,
          correlationId: row.correlationId ?? null,
          handoffTo: row.handoffTo ?? null,
          taskId: row.taskId ?? null,
          taskState: taskState,
          notes:
            row.notes && !a.notes.includes(row.notes)
              ? [row.notes, ...a.notes].slice(0, 40)
              : a.notes,
          live: true,
        };
      });

      let tasks = prev.tasks;
      for (const row of rows) {
        const taskState = normaliseTaskState(row.taskState);
        if (!taskState) continue;
        if (row.taskId) {
          const idx = tasks.findIndex((t) => t.id === row.taskId);
          if (idx >= 0) {
            tasks = tasks.map((t) =>
              t.id === row.taskId
                ? {
                    ...t,
                    status: taskState,
                    title: row.taskTitle || t.title,
                    updatedAt: row.updatedAt,
                  }
                : t
            );
            continue;
          }
        }
        if (row.taskTitle) {
          const match = tasks.find(
            (t) =>
              t.agentId === row.agentId &&
              t.title === row.taskTitle &&
              t.status !== "done"
          );
          if (match) {
            tasks = tasks.map((t) =>
              t.id === match.id
                ? { ...t, status: taskState, updatedAt: row.updatedAt }
                : t
            );
          } else if (
            taskState === "in_progress" ||
            taskState === "blocked" ||
            taskState === "review"
          ) {
            const now = row.updatedAt;
            tasks = [
              {
                id: row.taskId || `live-${row.agentId}-${now}`,
                title: row.taskTitle,
                agentName: row.agentName,
                agentId: row.agentId,
                status: taskState,
                notes: row.blockerReason || "",
                updatedAt: now,
                createdAt: now,
              },
              ...tasks,
            ];
          }
        }
      }

      return {
        ...prev,
        agents,
        tasks,
        liveSync: {
          mode: "live",
          lastFetchAt: new Date().toISOString(),
          storage: snap.storage,
          error: null,
          schemaVersion: snap.schemaVersion,
        },
      };
    });
  }, []);

  const setLiveSync = useCallback((patch: Partial<LiveSyncState>) => {
    setState((prev) => ({
      ...prev,
      liveSync: { ...prev.liveSync, ...patch },
    }));
  }, []);

  // Poll shared live snapshot every 5s (and once immediately after hydrate)
  useEffect(() => {
    if (!state.hydrated) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelled) return;
      setState((prev) => ({
        ...prev,
        liveSync: {
          ...prev.liveSync,
          mode: prev.liveSync.mode === "live" ? "live" : "polling",
        },
      }));
      try {
        const res = await fetch("/api/agent-ops/status", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const snap = (await res.json()) as AgentOpsSnapshot;
        if (!cancelled) applyLiveSnapshot(snap);
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            liveSync: {
              ...prev.liveSync,
              mode: "offline",
              error: err instanceof Error ? err.message : "Fetch failed",
            },
          }));
        }
      } finally {
        if (!cancelled) {
          timer = setTimeout(poll, POLL_MS);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [state.hydrated, applyLiveSnapshot]);

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
      } else if (status === "failed") {
        agentStatus = "blocked";
      } else if (status === "blocked") {
        agentStatus = "blocked";
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
      applyLiveSnapshot,
      setLiveSync,
    }),
    [
      state,
      assignTask,
      updateTaskStatus,
      setAgentStatus,
      addAgentNote,
      updateCodexStatus,
      resetDemo,
      applyLiveSnapshot,
      setLiveSync,
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
