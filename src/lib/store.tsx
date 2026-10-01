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
import { STORAGE_KEY, seedCodex } from "./seed";
import { demoDataAllowed, initialData, showNoLiveData } from "./demo-policy";
import type { AgentOpsSnapshot } from "./live-types";
import { normaliseTaskState } from "./live-types";
import type { FreshnessRef } from "./freshness";
import {
  DEFAULT_LIVE_SYNC,
  formatShowingDataFrom,
  isTrulyOffline,
  offlineDimAt,
  POLL_MS,
  POLL_TIMEOUT_MS,
  reduceLiveSync,
  resolveSnapshotAt,
  type LiveSyncEvent,
} from "./live-sync";

export interface SnapshotMeta {
  /** Client Date.now() when the response arrived */
  receivedAt: number;
  /** Server clock for the snapshot (see resolveSnapshotAt) */
  snapshotAt: number;
}

interface OpsContextValue extends OpsState {
  assignTask: (agentId: string, title: string, notes?: string) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  addAgentNote: (agentId: string, note: string) => void;
  updateCodexStatus: (entryId: string, status: CodexStatus) => void;
  resetDemo: () => void;
  applyLiveSnapshot: (snap: AgentOpsSnapshot, meta?: SnapshotMeta) => void;
  setLiveSync: (patch: Partial<LiveSyncState>) => void;
  /** Snapshot-relative clock for derivePresence / isLiveDot / displayNow */
  freshness: FreshnessRef;
  /**
   * Visual-only offline cue: `dimmed` once truly offline and the last good
   * sync is OFFLINE_DIM_AFTER_MS old; `dataFrom` = "Showing data from HH:MM".
   */
  offlineDim: { dimmed: boolean; dataFrom: string | null };
  /** Built-in demo data allowed (dev / previews; never production builds). */
  demoData: boolean;
  /** A snapshot with rows has loaded in this tab (stays true after failures). */
  liveDataLoaded: boolean;
  /** Production with no live data yet → show the "No live data yet" state. */
  noLiveData: boolean;
}

const DEFAULT_LIVE: LiveSyncState = DEFAULT_LIVE_SYNC;

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

const DEMO = demoDataAllowed();

function buildInitial(roster: RosterSeed): Omit<OpsState, "hydrated"> {
  return {
    ...initialData(roster, DEMO),
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
        if (!DEMO) {
          // Production: persisted agents/tasks may be old demo data — only
          // live snapshots may fill them. Codex review state is kept.
          if (Array.isArray(parsed.codex)) {
            setState((s) => ({ ...s, codex: parsed.codex, hydrated: true }));
            return;
          }
        } else if (parsed.agents?.length === 31) {
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

  const [liveDataLoaded, setLiveDataLoaded] = useState(false);

  const applyLiveSnapshot = useCallback(
    (snap: AgentOpsSnapshot, meta?: SnapshotMeta) => {
      if (Object.keys(snap.agents || {}).length > 0) setLiveDataLoaded(true);
      const receivedAt = meta?.receivedAt ?? Date.now();
      const success: LiveSyncEvent = {
        type: "poll-success",
        receivedAt,
        snapshotAt:
          meta?.snapshotAt ??
          resolveSnapshotAt({
            dateHeader: null,
            payloadUpdatedAt: snap.updatedAt,
            receivedAt,
          }),
        storage: snap.storage,
        schemaVersion: snap.schemaVersion,
      };
      setState((prev) => {
        const rows = Object.values(snap.agents || {});
        if (rows.length === 0) {
          return {
            ...prev,
            liveSync: reduceLiveSync(prev.liveSync, success),
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
            // Independent of status/task; legacy rows (no field) → none.
            parkedBlockers: Array.isArray(row.parkedBlockers)
              ? row.parkedBlockers
              : [],
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
          liveSync: reduceLiveSync(prev.liveSync, success),
        };
      });
    },
    []
  );

  const setLiveSync = useCallback((patch: Partial<LiveSyncState>) => {
    setState((prev) => ({
      ...prev,
      liveSync: { ...prev.liveSync, ...patch },
    }));
  }, []);

  // Poll shared live snapshot every 5s (and once immediately after hydrate).
  // - One failed poll never flips the board; offline after 3 in a row
  //   (see reduceLiveSync).
  // - Tab becoming visible → refetch now, suppress stale marking until it
  //   resolves (background tabs throttle setTimeout to ~1/min).
  useEffect(() => {
    if (!state.hydrated) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: Promise<void> | null = null;

    const dispatch = (event: LiveSyncEvent) =>
      setState((prev) => {
        const liveSync = reduceLiveSync(prev.liveSync, event);
        return liveSync === prev.liveSync ? prev : { ...prev, liveSync };
      });

    function schedule(ms: number) {
      if (timer) clearTimeout(timer);
      timer = cancelled ? null : setTimeout(run, ms);
    }

    async function poll() {
      dispatch({ type: "poll-start" });
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), POLL_TIMEOUT_MS);
      try {
        const res = await fetch("/api/agent-ops/status", {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const snap = (await res.json()) as AgentOpsSnapshot;
        const receivedAt = Date.now();
        if (cancelled) return;
        applyLiveSnapshot(snap, {
          receivedAt,
          snapshotAt: resolveSnapshotAt({
            dateHeader: res.headers.get("date"),
            payloadUpdatedAt: snap.updatedAt,
            receivedAt,
          }),
        });
      } catch (err) {
        if (cancelled) return;
        dispatch({
          type: "poll-failure",
          error: ctrl.signal.aborted
            ? `Timed out after ${POLL_TIMEOUT_MS / 1000}s`
            : err instanceof Error
              ? err.message
              : "Fetch failed",
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    function run() {
      timer = null;
      if (cancelled || inFlight) return;
      inFlight = poll().finally(() => {
        inFlight = null;
        schedule(POLL_MS);
      });
    }

    function onVisibilityChange() {
      if (cancelled || document.visibilityState !== "visible") return;
      dispatch({ type: "visible" });
      // A poll already in flight will clear the suppression when it resolves.
      if (inFlight) return;
      if (timer) clearTimeout(timer);
      run();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    run();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
    setState((prev) => ({
      ...buildInitial(roster),
      // Production has no demo data to reset to: keep the live view.
      ...(DEMO ? {} : { agents: prev.agents, liveSync: prev.liveSync }),
      hydrated: true,
    }));
  }, [roster]);

  const { snapshotAt, receivedAt, suppressStale } = state.liveSync;
  const offline = isTrulyOffline(state.liveSync);
  const freshness = useMemo<FreshnessRef>(
    () => ({ snapshotAt, receivedAt, suppressStale, offline }),
    [snapshotAt, receivedAt, suppressStale, offline]
  );

  // Flip `dimmed` with a single timer at receivedAt + OFFLINE_DIM_AFTER_MS
  // (no per-second re-render of the tree). Any success clears it at once.
  const dimAt = offlineDimAt(state.liveSync);
  const [dimmed, setDimmed] = useState(false);
  useEffect(() => {
    if (dimAt == null) {
      setDimmed(false);
      return;
    }
    const delay = dimAt - Date.now();
    if (delay <= 0) {
      setDimmed(true);
      return;
    }
    setDimmed(false);
    const t = setTimeout(() => setDimmed(true), delay);
    return () => clearTimeout(t);
  }, [dimAt]);
  // `dimAt == null` (e.g. a poll just succeeded) clears dimming in the same
  // render, before the effect catches up.
  const isDimmed = dimmed && dimAt != null;
  const offlineDim = useMemo(
    () => ({
      dimmed: isDimmed,
      dataFrom: isDimmed
        ? formatShowingDataFrom({ snapshotAt, receivedAt })
        : null,
    }),
    [isDimmed, snapshotAt, receivedAt]
  );

  const value = useMemo(
    () => ({
      ...state,
      freshness,
      offlineDim,
      demoData: DEMO,
      liveDataLoaded,
      noLiveData: showNoLiveData(DEMO, liveDataLoaded),
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
      freshness,
      offlineDim,
      liveDataLoaded,
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
