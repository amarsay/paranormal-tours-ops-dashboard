import { NextResponse } from "next/server";
import type { ContentReviewListResponse, ContentStatus } from "@/lib/content-review-types";
import { CONTENT_STATUSES } from "@/lib/content-review-types";
import {
  applyInbound,
  budgetSummary,
  filterByStatus,
  getPackage,
  listPackages,
  parseInboundMeta,
  reviewMode,
  savePackage,
} from "@/lib/content-review-store";
import { requireWriteToken } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — list packages, optional ?status=review|revising|… (`review` = any platform row still in review). */
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
  const packages = status ? filterByStatus(all, status) : all;
  const body: ContentReviewListResponse = {
    packages,
    mode: reviewMode(),
    budget: budgetSummary(all),
    updatedAt: new Date().toISOString(),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST — n8n upserts a package (Bearer OPS_WRITE_TOKEN). `source: "sheet" | "n8n"`.
 * Older revision → 409. Same revision → accepted as a status / platform-status
 * update (partial body is fine). Newer revision or new item → full package.
 * Legacy `contentId` is accepted as an alias for `packageId`.
 */
export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseInboundMeta(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const existing = await getPackage(parsed.meta.packageId);
  const result = applyInbound(existing, parsed.meta, parsed.body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.current ? { storedRevision: result.current.revision } : {}) },
      { status: result.status }
    );
  }

  const saved = await savePackage(result.pkg);
  return NextResponse.json({
    ok: true,
    result: result.kind,
    package: saved,
    storage: reviewMode().storage,
  });
}
