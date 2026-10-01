import { NextResponse } from "next/server";
import { StoreUnavailableError } from "./live-store";

/**
 * Runs a route body; a StoreUnavailableError becomes
 * 503 { code: "store_unavailable" } (no-store). Nothing ever falls back to
 * the per-instance memory store, so clients see a clear failure instead of
 * data that flips between serverless instances.
 */
export async function withStore(
  where: string,
  fn: () => Promise<Response>
): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof StoreUnavailableError)) throw err;
    console.error(`[agent-ops] ${where}: store unavailable`, err.message);
    return NextResponse.json(
      {
        error: "Status store unavailable — nothing was applied",
        code: "store_unavailable",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
