import { NextResponse } from "next/server";
import { resetMockPackages, reviewMode } from "@/lib/content-review-store";
import { requestHasReviewAccess } from "@/lib/review-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST — restore the example packages. Mock mode only. */
export async function POST(req: Request) {
  if (!(await requestHasReviewAccess(req))) {
    return NextResponse.json({ error: "Review session required." }, { status: 401 });
  }
  if (!reviewMode().mock) {
    return NextResponse.json(
      { error: "Example data can only be reset in mock mode." },
      { status: 409 }
    );
  }
  const packages = await resetMockPackages();
  return NextResponse.json({ ok: true, count: packages.length });
}
