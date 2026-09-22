"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { formatRelative, useOps } from "@/lib/store";
import { derivePresence, formatUpdatedAgo, isLiveDot } from "@/lib/freshness";
import type { AgentStatus } from "@/types";
import { AgentStatusChip, LiveDot, TaskStatusChip } from "./StatusChip";

export function AgentDetail({ slug }: { slug: string }) {
  const {
    agents,
    tasks,
    activity,
    hydrated,
    assignTask,
    setAgentStatus,
    addAgentNote,
    updateTaskStatus,
  } = useOps();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [brief, setBrief] = useState("");

  if (!hydrated) {
    return <div className="card p-6 text-sm text-ink-400">Loading agent…</div>;
  }

  const agent = agents.find((a) => a.id === slug);
  if (!agent) {
    return (
      <div className="card p-6">
        <p className="text-ink-200">Agent not found.</p>
        <Link href="/agents" className="mt-3 inline-block text-sm text-teal-300">
          ← Back to agents
        </Link>
      </div>
    );
  }

  const agentTasks = tasks.filter((t) => t.agentId === agent.id);
  const agentActivity = activity.filter((a) => a.agentName === agent.name);

  function onAssign(e: FormEvent) {
    e.preventDefault();
    assignTask(agent!.id, title, notes);
    setTitle("");
    setNotes("");
  }

  function onBrief(e: FormEvent) {
    e.preventDefault();
    addAgentNote(agent!.id, brief);
    setBrief("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/agents"
            className="text-xs text-ink-400 hover:text-teal-300"
          >
            ← All agents
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-50">
            {agent.displayName}
          </h1>
          <p className="mt-1 text-sm text-ink-300">{agent.role}</p>
          <p className="mt-1 text-xs uppercase tracking-wider text-ink-500">
            {agent.squad}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <LiveDot live={isLiveDot(agent)} />
            <AgentStatusChip status={derivePresence(agent)} />
          </div>
          <p className="text-xs text-ink-500">
            {formatUpdatedAgo(agent.heartbeatAt || agent.lastUpdate)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-ink-100">Current task</h2>
            <p className="mt-2 text-ink-200">
              {agent.currentTask ?? "Idle — assign work below."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ["idle", "Mark idle"],
                  ["working", "Mark working"],
                  ["blocked", "Mark blocked"],
                  ["review", "Mark review"],
                ] as [AgentStatus, string][]
              ).map(([s, label]) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAgentStatus(agent.id, s)}
                  className="btn-ghost"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-100">
              Assign task
            </h2>
            <form onSubmit={onAssign} className="space-y-3">
              <input
                className="input w-full"
                placeholder="Task title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <textarea
                className="input min-h-[80px] w-full"
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <button type="submit" className="btn-primary">
                Assign &amp; set working
              </button>
            </form>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-100">
              Ask agent (briefing note)
            </h2>
            <p className="mb-3 text-xs text-ink-500">
              Stores a local note until live Grok Bot messaging is integrated.
            </p>
            <form onSubmit={onBrief} className="space-y-3">
              <textarea
                className="input min-h-[72px] w-full"
                placeholder="Brief this agent…"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                required
              />
              <button type="submit" className="btn-secondary">
                Store briefing
              </button>
            </form>
            {agent.notes.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-white/5 pt-4">
                {agent.notes.map((n, i) => (
                  <li
                    key={`${i}-${n.slice(0, 12)}`}
                    className="rounded-lg bg-white/[0.03] px-3 py-2 text-sm text-ink-300"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-100">
              Task history
            </h2>
            <ul className="space-y-2">
              {agentTasks.length === 0 && (
                <li className="text-sm text-ink-500">No tasks yet.</li>
              )}
              {agentTasks.map((task) => (
                <li
                  key={task.id}
                  className="rounded-lg bg-white/[0.03] px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-ink-100">{task.title}</p>
                    <TaskStatusChip status={task.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(
                      [
                        "backlog",
                        "in_progress",
                        "review",
                        "done",
                      ] as const
                    ).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={task.status === s}
                        onClick={() => updateTaskStatus(task.id, s)}
                        className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-400 ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-40"
                      >
                        {s.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-100">
              Activity log
            </h2>
            <ul className="space-y-2">
              {agentActivity.slice(0, 10).map((item) => (
                <li key={item.id} className="text-sm text-ink-300">
                  <span className="text-ink-500">
                    {formatRelative(item.at)} ·{" "}
                  </span>
                  {item.message}
                </li>
              ))}
              {agentActivity.length === 0 && (
                <li className="text-sm text-ink-500">No activity yet.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
