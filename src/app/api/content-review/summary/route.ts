import { NextResponse } from "next/server";
import type { ContentReviewSummary } from "@/lib/content-review-types";
import { listPackages, reviewMode } from "@/lib/content-review-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — counts only (public; used by the nav badge and Overview strip). */
export async function GET() {
  const all = await listPackages();
  const body: ContentReviewSummary = {
    pending: all.filter((p) => p.status === "review").length,
    blocked: all.filter((p) => p.status === "blocked").length,
    mock: reviewMode().mock,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
