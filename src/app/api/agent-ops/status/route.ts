import { NextResponse } from "next/server";
import {
  getSnapshotWithBlockers,
  handleStatusPost,
} from "@/lib/agent-ops-status";
import type { AgentOpsHeartbeatBody } from "@/lib/live-types";
import { readJsonObjectBody, requireWriteToken } from "@/lib/ops-auth";
import { withStore } from "@/lib/store-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET — dashboard poll (no auth). Current-state snapshot only; each row
 * carries `parkedBlockers` ([] when none).
 */
export async function GET() {
  return withStore("status GET", async () => {
    const snap = await getSnapshotWithBlockers();
    return NextResponse.json(snap, {
      headers: { "Cache-Control": "no-store" },
    });
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

  // empty_body / invalid_json / invalid_body (null, array, number, string)
  const parsed = await readJsonObjectBody(req);
  if (!parsed.ok) return parsed.response;

  return withStore("status POST", async () => {
    const result = await handleStatusPost(parsed.body as AgentOpsHeartbeatBody);
    return NextResponse.json(result.body, { status: result.status });
  });
}
