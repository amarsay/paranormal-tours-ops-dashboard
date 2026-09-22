import { NextResponse } from "next/server";
import { applyHeartbeat } from "@/lib/apply-heartbeat";
import type { AgentOpsHeartbeatBody } from "@/lib/live-types";
import { getSnapshot } from "@/lib/live-store";
import { requireWriteToken } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Alias of /api/agent-ops/status — same store. */
export async function GET() {
  const snap = await getSnapshot();
  return NextResponse.json(snap, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;

  let body: AgentOpsHeartbeatBody;
  try {
    body = (await req.json()) as AgentOpsHeartbeatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await applyHeartbeat(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const snap = await getSnapshot();
  return NextResponse.json({ ok: true, row: result.row, snapshot: snap });
}
