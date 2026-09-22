import { NextResponse } from "next/server";
import { applyHeartbeat } from "@/lib/apply-heartbeat";
import { getSnapshot, replaceAgents } from "@/lib/live-store";
import { listRosterAgents } from "@/lib/roster-resolve";
import { requireWriteToken } from "@/lib/ops-auth";
import type { AgentOpsRow } from "@/lib/live-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Mock status stream — cycles a handful of roster agents through Flo
 * presence/task states so Overview works without Upstash or Spectre.
 *
 * GET  — advance one mock tick + return snapshot (no auth; local demo)
 * POST — same, or { "reset": true } to clear (Bearer OPS_WRITE_TOKEN)
 */

const MOCK_SCRIPT: Array<{
  agentId: string;
  presence: string;
  taskTitle: string | null;
  taskState: string;
  blockerReason?: string;
  message?: string;
}> = [
  {
    agentId: "billy",
    presence: "working",
    taskTitle: "Ship Codex Ignota landing polish",
    taskState: "in_progress",
    message: "Building landing polish",
  },
  {
    agentId: "verity",
    presence: "blocked",
    taskTitle: "Review Pendle Hill witness cluster",
    taskState: "blocked",
    blockerReason: "Awaiting founder decision on evidence grade",
    message: "Blocked on evidence grade",
  },
  {
    agentId: "atlas",
    presence: "review",
    taskTitle: "Normalise taxonomy tags for UK hauntings",
    taskState: "review",
    message: "Ready for review",
  },
  {
    agentId: "sally",
    presence: "working",
    taskTitle: "Draft September tour teaser carousel",
    taskState: "in_progress",
  },
  {
    agentId: "flo",
    presence: "idle",
    taskTitle: null,
    taskState: "backlog",
  },
  {
    agentId: "billy",
    presence: "done",
    taskTitle: "Ship Codex Ignota landing polish",
    taskState: "done",
    message: "Landing polish shipped",
  },
  {
    agentId: "kezza",
    presence: "working",
    taskTitle: "Lock Spectre ops contract",
    taskState: "in_progress",
  },
  {
    agentId: "spectre",
    presence: "working",
    taskTitle: "Emit agent heartbeats",
    taskState: "in_progress",
  },
  {
    agentId: "verity",
    presence: "failed",
    taskTitle: "Review Pendle Hill witness cluster",
    taskState: "failed",
    blockerReason: "Source pack missing",
    message: "Failed — source pack missing",
  },
  {
    agentId: "verity",
    presence: "idle",
    taskTitle: null,
    taskState: "backlog",
  },
];

declare global {
  // eslint-disable-next-line no-var
  var __ptMockTick: number | undefined;
}

function nextTick(): number {
  const t = (globalThis.__ptMockTick ?? 0) % MOCK_SCRIPT.length;
  globalThis.__ptMockTick = t + 1;
  return t;
}

async function runMockTick() {
  const step = MOCK_SCRIPT[nextTick()]!;
  const roster = listRosterAgents();
  const known = new Set(roster.map((a) => a.id));
  if (!known.has(step.agentId)) {
    return { error: `Mock agent ${step.agentId} not in roster` };
  }
  const now = new Date().toISOString();
  await applyHeartbeat({
    agentId: step.agentId,
    presence: step.presence,
    status: step.presence,
    taskTitle: step.taskTitle,
    taskState: step.taskState,
    blockerReason: step.blockerReason,
    message: step.message,
    heartbeatAt: now,
    updatedAt: now,
  });
  return getSnapshot();
}

export async function GET() {
  const snap = await runMockTick();
  if ("error" in snap && snap.error) {
    return NextResponse.json(snap, { status: 500 });
  }
  return NextResponse.json(
    { ok: true, mock: true, tick: (globalThis.__ptMockTick ?? 1) - 1, ...snap },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;

  let body: { reset?: boolean } = {};
  try {
    body = (await req.json()) as { reset?: boolean };
  } catch {
    /* empty body ok */
  }

  if (body.reset) {
    await replaceAgents({} as Record<string, AgentOpsRow>);
    globalThis.__ptMockTick = 0;
    const snap = await getSnapshot();
    return NextResponse.json({ ok: true, reset: true, ...snap });
  }

  const snap = await runMockTick();
  return NextResponse.json({ ok: true, mock: true, ...snap });
}
