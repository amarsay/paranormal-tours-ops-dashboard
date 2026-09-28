import { NextResponse } from "next/server";
import type {
  ContentHistoryEntry,
  ContentPackage,
  PlatformId,
  ReviewActionPayload,
  ReviewActionRequest,
  ReviewStage,
} from "@/lib/content-review-types";
import { getPackage, reviewMode, savePackage } from "@/lib/content-review-store";
import { platformStatus, validateAction } from "@/lib/content-review-rules";
import { requestHasReviewAccess } from "@/lib/review-session";
import { forwardToN8n } from "@/lib/review-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function uniq<T>(xs: T[] | undefined): T[] {
  return Array.from(new Set(Array.isArray(xs) ? xs : []));
}

function historyEntry(pkg: ContentPackage, payload: ReviewActionPayload): ContentHistoryEntry {
  if (payload.action === "mark_manual_done") {
    return {
      revision: pkg.revision,
      action: payload.action,
      stages: [],
      platforms: [payload.platform],
      feedback: "Finished by hand in the app",
      actor: payload.actor,
      at: payload.at,
    };
  }
  return {
    revision: pkg.revision,
    action: payload.action,
    stages: payload.action === "confirm_tone" ? [] : payload.stages,
    platforms: payload.action === "confirm_tone" ? [] : payload.platforms,
    feedback: payload.action === "confirm_tone" ? "Tone and CTA confirmed" : payload.feedback,
    actor: payload.actor,
    at: payload.at,
  };
}

/** MOCK mode only: apply the action straight to the local display cache. */
function applyMock(pkg: ContentPackage, payload: ReviewActionPayload): ContentPackage {
  const next: ContentPackage = {
    ...pkg,
    platforms: pkg.platforms.map((p) => ({ ...p })),
    history: [...pkg.history, historyEntry(pkg, payload)],
    updatedAt: payload.at,
    pendingAction: null,
  };

  if (payload.action === "approve") {
    const chosen = new Set<PlatformId>(payload.platforms);
    next.platforms = next.platforms.map((p) => {
      const cur = platformStatus(pkg, p);
      if (cur !== "review") return p; // rows already decided (e.g. via the sheet) stay as they are
      return { ...p, status: chosen.has(p.platform) ? "approved" : "not_approved" };
    });
    if (payload.toneChecked) next.toneCheckedRevision = pkg.revision;
    if (payload.selectedTitle) {
      next.platforms = next.platforms.map((p) =>
        p.platform === "youtube" ? { ...p, title: payload.selectedTitle, selectedTitle: payload.selectedTitle } : p
      );
    }
    next.status = next.platforms.some((p) => p.status === "approved") ? "approved" : pkg.status;
  } else if (payload.action === "reject") {
    // In real mode n8n owns revision numbers and posts the new package back.
    next.status = "revising";
    next.revision = pkg.revision + 1;
    next.revisionCount = pkg.revisionCount + 1;
    next.toneCheckedRevision = null; // new revision → tone tick resets
    next.platforms = next.platforms.map((p) => ({ ...p, status: "review" }));
  } else if (payload.action === "kill") {
    next.status = "killed";
    next.platforms = next.platforms.map((p) =>
      ["posted", "scheduled"].includes(platformStatus(pkg, p)) ? p : { ...p, status: "killed" }
    );
  } else if (payload.action === "mark_manual_done") {
    next.platforms = next.platforms.map((p) =>
      p.platform === payload.platform
        ? { ...p, status: "posted_manual", postedAt: payload.at, postedRevision: pkg.revision }
        : p
    );
  } else {
    // confirm_tone: tone ticked for this revision; held rows are released.
    next.toneCheckedRevision = pkg.revision;
    next.platforms = next.platforms.map((p) =>
      platformStatus(pkg, p) === "held_tone" ? { ...p, status: "approved" } : p
    );
  }
  return next;
}

function buildPayload(pkg: ContentPackage, body: ReviewActionRequest): ReviewActionPayload {
  const at = new Date().toISOString();
  if (body.action === "mark_manual_done") {
    return {
      action: "mark_manual_done",
      packageId: pkg.packageId,
      revision: pkg.revision,
      platform: body.platform!,
      actor: "founder",
      at,
    };
  }
  if (body.action === "confirm_tone") {
    return { action: "confirm_tone", packageId: pkg.packageId, revision: pkg.revision, toneChecked: true, actor: "founder", at };
  }
  const payload: ReviewActionPayload = {
    action: body.action,
    packageId: pkg.packageId,
    revision: pkg.revision,
    platforms: uniq<PlatformId>(body.platforms),
    stages: body.action === "reject" ? uniq<ReviewStage>(body.stages) : [],
    feedback: body.action === "reject" ? String(body.feedback ?? "").trim().slice(0, 4000) : "",
    actor: "founder",
    at,
  };
  if (body.action === "approve") {
    payload.toneChecked = body.toneChecked === true;
    if (payload.platforms.includes("youtube") && typeof body.selectedTitle === "string" && body.selectedTitle) {
      payload.selectedTitle = body.selectedTitle;
    }
  }
  return payload;
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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Missing action body." }, { status: 400 });
  }

  const packageId = decodeURIComponent(params.id);
  const pkg = await getPackage(packageId);
  if (!pkg) {
    return NextResponse.json({ error: "Package not found." }, { status: 404 });
  }

  const mode = reviewMode();

  // Retry (real mode): resend the stored payload byte-for-byte; same revision lets n8n dedupe.
  if (body.retry === true) {
    if (mode.mock) {
      return NextResponse.json({ error: "Nothing to retry in mock mode." }, { status: 409 });
    }
    const pa = pkg.pendingAction;
    if (!pa) {
      return NextResponse.json({ error: "No pending action to retry.", current: pkg }, { status: 409 });
    }
    if (body.revision !== pkg.revision || pa.payload.revision !== pkg.revision) {
      return NextResponse.json(
        { error: `This item has moved on (revision ${pkg.revision}). Refresh.`, current: pkg },
        { status: 409 }
      );
    }
    const attempt = (pa.attempts ?? 1) + 1;
    const fwd = await forwardToN8n(pa.payload, { attempt });
    if (!fwd.ok) return NextResponse.json({ error: fwd.error }, { status: fwd.status });
    const updated = await savePackage({
      ...pkg,
      pendingAction: { ...pa, attempts: attempt, lastSentAt: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true, mock: false, retried: true, package: updated });
  }

  const check = validateAction(pkg, body);
  if (!check.ok) {
    // On a conflict, hand back the current package so the UI can refresh the card.
    const extra = check.status === 409 ? { current: pkg } : {};
    return NextResponse.json({ error: check.error, ...extra }, { status: check.status });
  }

  const payload = buildPayload(pkg, body);

  if (mode.mock) {
    const updated = await savePackage(applyMock(pkg, payload));
    return NextResponse.json({ ok: true, mock: true, package: updated });
  }

  const fwd = await forwardToN8n(payload, { attempt: 1 });
  if (!fwd.ok) {
    return NextResponse.json({ error: fwd.error }, { status: fwd.status });
  }
  // Real mode: no optimistic status flip. The card shows a pending state until
  // n8n writes the sheet and posts the new state back to POST /api/content-review.
  const updated = await savePackage({
    ...pkg,
    history: [...pkg.history, historyEntry(pkg, payload)],
    pendingAction: { action: payload.action, at: payload.at, lastSentAt: payload.at, attempts: 1, payload },
  });
  return NextResponse.json({ ok: true, mock: false, pending: true, package: updated });
}
