import { NextResponse } from "next/server";
import type {
  ContentPackage,
  PlatformId,
  ReviewActionPayload,
  ReviewActionRequest,
  ReviewStage,
} from "@/lib/content-review-types";
import { getPackage, reviewMode, savePackage } from "@/lib/content-review-store";
import { validateAction } from "@/lib/content-review-rules";
import { requestHasReviewAccess } from "@/lib/review-session";
import { forwardToN8n } from "@/lib/review-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function uniq<T>(xs: T[] | undefined): T[] {
  return Array.from(new Set(xs ?? []));
}

/** Apply the action to the local display cache. */
function applyLocally(
  pkg: ContentPackage,
  payload: ReviewActionPayload,
  mock: boolean
): ContentPackage {
  const next: ContentPackage = {
    ...pkg,
    platforms: pkg.platforms.map((p) => ({ ...p })),
    history: [...pkg.history],
    updatedAt: payload.at,
  };
  const entry = {
    revision: pkg.revision,
    action: payload.action,
    stages: payload.stages,
    platforms: payload.platforms,
    feedback: payload.feedback,
    actor: payload.actor,
    at: payload.at,
  };

  if (payload.action === "approve") {
    next.status = "approved";
    const chosen = new Set<PlatformId>(payload.platforms);
    next.platforms = next.platforms.map((p) => ({
      ...p,
      status: chosen.has(p.platform) ? "approved" : "skipped",
    }));
  } else if (payload.action === "reject") {
    next.status = "revising";
    if (mock) {
      // In live mode n8n owns revision numbers and posts the new package back.
      next.revision = pkg.revision + 1;
      next.revisionCount = pkg.revisionCount + 1;
    }
  } else {
    next.status = "rejected";
  }
  next.history.push(entry);
  return next;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!(await requestHasReviewAccess(req))) {
    return NextResponse.json({ error: "Review session required." }, { status: 401 });
  }

  let body: ReviewActionRequest;
  try {
    body = (await req.json()) as ReviewActionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contentId = decodeURIComponent(params.id);
  const pkg = await getPackage(contentId);
  if (!pkg) {
    return NextResponse.json({ error: "Content item not found." }, { status: 404 });
  }

  const check = validateAction(pkg, body);
  if (!check.ok) {
    // On a conflict, hand back the current package so the UI can refresh the card.
    const extra = check.status === 409 ? { current: pkg } : {};
    return NextResponse.json({ error: check.error, ...extra }, { status: check.status });
  }

  const payload: ReviewActionPayload = {
    action: body.action,
    contentId: pkg.contentId,
    revision: pkg.revision,
    platforms: uniq<PlatformId>(body.platforms),
    stages: body.action === "reject" ? uniq<ReviewStage>(body.stages) : [],
    feedback: body.action === "reject" ? (body.feedback ?? "").trim().slice(0, 4000) : "",
    actor: "founder",
    at: new Date().toISOString(),
  };

  const mode = reviewMode();
  if (mode.mock) {
    const updated = await savePackage(applyLocally(pkg, payload, true));
    return NextResponse.json({ ok: true, mock: true, package: updated });
  }

  const fwd = await forwardToN8n(payload);
  if (!fwd.ok) {
    return NextResponse.json({ error: fwd.error }, { status: fwd.status });
  }
  // n8n will post the authoritative package back; reflect the action meanwhile.
  const updated = await savePackage(applyLocally(pkg, payload, false));
  return NextResponse.json({ ok: true, mock: false, package: updated });
}
