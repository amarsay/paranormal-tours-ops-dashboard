import { NextResponse } from "next/server";
import {
  getSnapshotWithBlockers,
  handleStatusPost,
} from "@/lib/agent-ops-status";
import type { AgentOpsHeartbeatBody } from "@/lib/live-types";
import { requireWriteToken } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET — dashboard poll (no auth). Current-state snapshot only; each row
 * carries `parkedBlockers` ([] when none).
 */
export async function GET() {
  const snap = await getSnapshotWithBlockers();
  return NextResponse.json(snap, {
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * POST — Spectre / agent heartbeat (Bearer OPS_WRITE_TOKEN).
 * Flo schema: presence, taskState, heartbeatAt, etc.
 * Optional `parkBlocker` / `clearBlocker` (see src/lib/parked-blockers.ts).
 */
export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;

  let body: AgentOpsHeartbeatBody;
  try {
    body = (await req.json()) as AgentOpsHeartbeatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await handleStatusPost(body);
  return NextResponse.json(result.body, { status: result.status });
}
