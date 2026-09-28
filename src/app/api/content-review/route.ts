import { NextResponse } from "next/server";
import type { ContentReviewListResponse, ContentStatus } from "@/lib/content-review-types";
import { CONTENT_STATUSES } from "@/lib/content-review-types";
import {
  budgetSummary,
  getPackage,
  listPackages,
  normalisePackage,
  reviewMode,
  savePackage,
} from "@/lib/content-review-store";
import { requireWriteToken } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — list packages, optional ?status=review|revising|… */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  let status: ContentStatus | null = null;
  if (statusParam) {
    if (!(CONTENT_STATUSES as readonly string[]).includes(statusParam)) {
      return NextResponse.json(
        { error: `status must be one of ${CONTENT_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    status = statusParam as ContentStatus;
  }

  const all = await listPackages();
  const packages = status ? all.filter((p) => p.status === status) : all;
  const body: ContentReviewListResponse = {
    packages,
    mode: reviewMode(),
    budget: budgetSummary(all),
    updatedAt: new Date().toISOString(),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

/** POST — n8n upserts the latest package for a content item (Bearer OPS_WRITE_TOKEN). */
export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalisePackage(raw);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const existing = await getPackage(result.pkg.contentId);
  if (existing && existing.revision > result.pkg.revision) {
    return NextResponse.json(
      {
        error: `Stale package: stored revision ${existing.revision} is newer than ${result.pkg.revision}.`,
      },
      { status: 409 }
    );
  }

  const saved = await savePackage(result.pkg);
  return NextResponse.json({ ok: true, package: saved, storage: reviewMode().storage });
}
