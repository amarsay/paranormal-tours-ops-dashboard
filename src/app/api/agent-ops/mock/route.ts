import { NextResponse } from "next/server";
import { applyHeartbeat } from "@/lib/apply-heartbeat";
import { getSnapshotWithBlockers } from "@/lib/agent-ops-status";
import { replaceAgents, storageMode } from "@/lib/live-store";
import { writeStatus } from "@/lib/status-write";
import { listRosterAgents } from "@/lib/roster-resolve";
import { requireWriteToken } from "@/lib/ops-auth";
import { assertWriteToken } from "@/lib/live-store";
import { mockWritePolicy } from "@/lib/mock-policy";
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

/**
 * EXAMPLE DATA (mock mode only) — agents that keep working while blockers are
 * parked. Heartbeated on every tick so they stay live; blockers are upserted
 * each tick (upsert keeps the original `since`, so waiting times grow).
 * `ageMs` backdates `since` when first created so the demo reads "waiting 2d 3h".
 *
 * Only seeded with the in-memory store: on Vercel the mock shares the real
 * Upstash store, and parked blockers don't age out like mock heartbeats do,
 * so example blockers would linger in the real "Needs you" strip.
 */
const MOCK_PARKED: Array<{
  agentId: string;
  taskTitle: string;
  blockers: Array<{ id: string; title: string; reason: string; ageMs: number }>;
}> = [
  {
    agentId: "sid",
    taskTitle: "VPS backup",
    blockers: [
      {
        id: "tailscale-ssh",
        title: "Tailscale SSH",
        reason:
          "Example data — needs founder to approve the Tailscale ACL change before SSH can be enabled.",
        ageMs: (2 * 24 + 3) * 3_600_000,
      },
    ],
  },
  {
    agentId: "polly",
    taskTitle: "Draft refund policy v2",
    blockers: [
      {
        id: "venue-insurance",
        title: "Venue insurance certificate",
        reason: "Example data — waiting on the venue to send its public liability certificate.",
        ageMs: 26 * 3_600_000,
      },
      {
        id: "pendle-landowner-consent",
        title: "Pendle Hill landowner consent",
        reason: "Example data — landowner hasn't replied to the night-access request.",
        ageMs: 5 * 3_600_000 + 20 * 60_000,
      },
    ],
  },
];

declare global {
  // eslint-disable-next-line no-var
  var __ptMockTick: number | undefined;
}

async function readOnly(reason: string) {
  const snap = await getSnapshotWithBlockers();
  return NextResponse.json(
    { ok: true, mock: true, readOnly: true, reason, ...snap },
    { headers: { "Cache-Control": "no-store" } }
  );
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
  const nowMs = Date.parse(now);
  const parkedExamples = storageMode() === "memory" ? MOCK_PARKED : [];
  for (const m of parkedExamples) {
    if (!known.has(m.agentId)) continue;
    await applyHeartbeat({
      agentId: m.agentId,
      presence: "working",
      status: "working",
      taskTitle: m.taskTitle,
      taskState: "in_progress",
      heartbeatAt: now,
      updatedAt: now,
    });
    for (const b of m.blockers) {
      await writeStatus({
        agentId: m.agentId,
        blocker: {
          type: "park",
          blocker: {
            id: b.id,
            title: b.title,
            reason: b.reason,
            since: new Date(nowMs - b.ageMs).toISOString(),
          },
        },
      });
    }
  }
  return getSnapshotWithBlockers();
}

export async function GET(req: Request) {
  const policy = mockWritePolicy();
  if (policy === "disabled") {
    return readOnly("Mock writes are disabled in production.");
  }
  if (
    policy === "token" &&
    !assertWriteToken(req.headers.get("authorization"))
  ) {
    return readOnly(
      "Mock writes to a shared store need Authorization: Bearer OPS_WRITE_TOKEN."
    );
  }
  const snap = await runMockTick();
  if ("error" in snap && snap.error) {
    return NextResponse.json({ ...snap, code: "mock_error" }, { status: 500 });
  }
  return NextResponse.json(
    { ok: true, mock: true, tick: (globalThis.__ptMockTick ?? 1) - 1, ...snap },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  if (mockWritePolicy() === "disabled") {
    return NextResponse.json(
      { error: "Mock writes are disabled in production.", code: "mock_disabled" },
      { status: 403 }
    );
  }

  let body: { reset?: boolean } = {};
  try {
    body = (await req.json()) as { reset?: boolean };
  } catch {
    /* empty body ok */
  }

  if (body.reset) {
    await replaceAgents({} as Record<string, AgentOpsRow>);
    // Only the example blockers — never real ones.
    for (const m of MOCK_PARKED) {
      for (const b of m.blockers) {
        await writeStatus({
          agentId: m.agentId,
          blocker: { type: "clear", id: b.id },
        });
      }
    }
    globalThis.__ptMockTick = 0;
    const snap = await getSnapshotWithBlockers();
    return NextResponse.json({ ok: true, reset: true, ...snap });
  }

  const snap = await runMockTick();
  return NextResponse.json({ ok: true, mock: true, ...snap });
}
