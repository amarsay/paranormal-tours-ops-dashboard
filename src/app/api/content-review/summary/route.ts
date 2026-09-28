import { NextResponse } from "next/server";
import type { ContentReviewSummary } from "@/lib/content-review-types";
import { listPackages, reviewMode } from "@/lib/content-review-store";
import { isActionable, isAwaitingManual, isHeld } from "@/lib/content-review-rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — counts only (public; used by the nav badge and Overview strip). */
export async function GET() {
  const all = await listPackages();
  const body: ContentReviewSummary = {
    // Derived from platform rows: any row in review, or held for a tone check.
    pending: all.filter(isActionable).length,
    held: all.filter(isHeld).length,
    manual: all.filter(isAwaitingManual).length,
    blocked: all.filter((p) => p.status === "blocked").length,
    mock: reviewMode().mock,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
