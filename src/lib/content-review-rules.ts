import type {
  ContentPackage,
  ContentStatus,
  PlatformCopy,
  PlatformId,
  PlatformStatus,
  ReviewAction,
  ReviewActionRequest,
  ReviewStage,
  StageCostEstimatesGbp,
} from "./content-review-types";
import {
  PENDING_WARN_MS,
  PLATFORM_IDS,
  PLATFORM_STATUSES,
  REVIEW_ACTIONS,
  REVIEW_STAGES,
} from "./content-review-types";

// ---------------------------------------------------------------------------
// Derived state. The sheet (via n8n) owns per-platform statuses; the card's
// place on /review is derived from the platform rows, not the package status.
// ---------------------------------------------------------------------------

/** Package statuses that take the whole card out of review whatever the rows say. */
const PACKAGE_OVERRIDES: ContentStatus[] = ["blocked", "killed", "revising"];

/** Default row status when a platform row arrives without one. */
export function defaultPlatformStatus(pkgStatus: ContentStatus): PlatformStatus {
  if ((PLATFORM_STATUSES as readonly string[]).includes(pkgStatus)) return pkgStatus as PlatformStatus;
  return "review"; // revising / blocked: rows are not decided yet
}

export function platformStatus(pkg: Pick<ContentPackage, "status">, p: PlatformCopy): PlatformStatus {
  return p.status ?? defaultPlatformStatus(pkg.status);
}

/** Platform rows still waiting for a founder decision. */
export function platformsInReview(pkg: Pick<ContentPackage, "status" | "platforms">): PlatformId[] {
  return pkg.platforms.filter((p) => platformStatus(pkg, p) === "review").map((p) => p.platform);
}

/**
 * True while the card belongs in "Awaiting review": at least one platform row
 * is still `review` (or, with no rows at all, the package itself is `review`).
 */
export function isAwaitingReview(pkg: Pick<ContentPackage, "status" | "platforms">): boolean {
  if (PACKAGE_OVERRIDES.includes(pkg.status)) return false;
  if (pkg.platforms.length === 0) return pkg.status === "review";
  return platformsInReview(pkg).length > 0;
}

/** Rows the Publish poller is holding for a missing tone check. */
export function platformsHeld(pkg: Pick<ContentPackage, "status" | "platforms">): PlatformId[] {
  return pkg.platforms.filter((p) => platformStatus(pkg, p) === "held_tone").map((p) => p.platform);
}

/** Rows held because a hand-typed title failed the banned-phrase check (youtube). */
export function platformsHeldTitle(pkg: Pick<ContentPackage, "status" | "platforms">): PlatformId[] {
  return pkg.platforms.filter((p) => platformStatus(pkg, p) === "held_title").map((p) => p.platform);
}

/** Rows the founder must finish by hand in the app. */
export function platformsAwaitingManual(pkg: Pick<ContentPackage, "status" | "platforms">): PlatformId[] {
  return pkg.platforms.filter((p) => platformStatus(pkg, p) === "awaiting_manual").map((p) => p.platform);
}

export function isAwaitingManual(pkg: Pick<ContentPackage, "status" | "platforms">): boolean {
  if (PACKAGE_OVERRIDES.includes(pkg.status)) return false;
  return platformsAwaitingManual(pkg).length > 0;
}

/** Rows held by the private→public release gate. */
export function platformsHeldRelease(pkg: Pick<ContentPackage, "status" | "platforms">): PlatformCopy[] {
  return pkg.platforms.filter((p) => platformStatus(pkg, p) === "held_release");
}

/** Card goes in the "Held" group at the top of /review (any held_tone / held_title / held_release row). */
export function isHeld(pkg: Pick<ContentPackage, "status" | "platforms">): boolean {
  if (PACKAGE_OVERRIDES.includes(pkg.status)) return false;
  return (
    platformsHeld(pkg).length > 0 ||
    platformsHeldTitle(pkg).length > 0 ||
    platformsHeldRelease(pkg).length > 0
  );
}

export function toneConfirmedForCurrent(pkg: Pick<ContentPackage, "revision" | "toneCheckedRevision">): boolean {
  return typeof pkg.toneCheckedRevision === "number" && pkg.toneCheckedRevision === pkg.revision;
}

/** Card has something the founder can act on (review rows, or held rows needing a tone tick). */
export function isActionable(pkg: Pick<ContentPackage, "status" | "platforms">): boolean {
  return isAwaitingReview(pkg) || isHeld(pkg) || isAwaitingManual(pkg);
}

/** Some rows decided, some still in review (e.g. partial approval via the sheet). */
export function isPartiallyDecided(pkg: Pick<ContentPackage, "status" | "platforms">): boolean {
  const open = platformsInReview(pkg).length;
  return open > 0 && open < pkg.platforms.length;
}

export const PENDING_LABEL: Record<ReviewAction, string> = {
  approve: "Approving…",
  reject: "Sending back…",
  kill: "Killing…",
  confirm_tone: "Confirming tone…",
  mark_manual_done: "Marking posted…",
  mark_stale: "Marking out of date…",
  pick_title: "Using title…",
};

export function pendingAgeMs(pkg: Pick<ContentPackage, "pendingAction">, now = Date.now()): number {
  const pa = pkg.pendingAction;
  if (!pa) return 0;
  const t = new Date(pa.lastSentAt || pa.at).getTime();
  return Number.isFinite(t) ? Math.max(0, now - t) : 0;
}

export function isPendingStale(pkg: Pick<ContentPackage, "pendingAction">, now = Date.now()): boolean {
  return Boolean(pkg.pendingAction) && pendingAgeMs(pkg, now) > PENDING_WARN_MS;
}

/**
 * Does an inbound (sheet / n8n) state show that the pending action landed?
 * approve → none of the approved rows is still `review`; reject → revising or
 * a newer revision; kill → killed. A newer revision always resolves it.
 */
export function pendingResolvedBy(prev: ContentPackage, next: ContentPackage): boolean {
  const pa = prev.pendingAction;
  if (!pa) return true;
  if (next.revision > prev.revision) return true;
  if (next.status === "killed") return true;
  if (pa.action === "reject") return next.status === "revising";
  if (pa.action === "kill") return false;
  if (pa.action === "confirm_tone") {
    return toneConfirmedForCurrent(next) || platformsHeld(next).length === 0;
  }
  if (pa.payload.action === "mark_manual_done") {
    const id = pa.payload.platform;
    const row = next.platforms.find((p) => p.platform === id);
    return !row || platformStatus(next, row) !== "awaiting_manual";
  }
  if (pa.payload.action === "mark_stale") {
    const id = pa.payload.platform;
    const row = next.platforms.find((p) => p.platform === id);
    return !row || platformStatus(next, row) !== "published_private";
  }
  if (pa.payload.action === "pick_title") {
    // Resolved once the sheet shows the picked title AND the row has left held_title.
    const want = youtubeTitleOptions(next)[pa.payload.titleIndex] ?? youtubeTitleOptions(prev)[pa.payload.titleIndex];
    const row = next.platforms.find((p) => p.platform === "youtube");
    const sel = row && "selectedTitle" in row ? row.selectedTitle : undefined;
    return Boolean(row && sel === want && platformStatus(next, row) !== "held_title");
  }
  const payload = pa.payload;
  if (payload.action === "confirm_tone") return false;
  const byId = new Map(next.platforms.map((p) => [p.platform, platformStatus(next, p)]));
  return payload.platforms.every((id) => byId.get(id) !== undefined && byId.get(id) !== "review");
}

/** Shared (client + server) validation for review actions. */
export type ActionCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function isAtCap(pkg: Pick<ContentPackage, "revisionCount" | "revisionCap">) {
  return pkg.revisionCount >= pkg.revisionCap;
}

export function validateAction(
  pkg: ContentPackage,
  req: ReviewActionRequest
): ActionCheck {
  if (!req || typeof req !== "object") {
    return { ok: false, status: 400, error: "Missing action body." };
  }
  if (!(REVIEW_ACTIONS as string[]).includes(req.action)) {
    return { ok: false, status: 400, error: "Action must be approve, reject, kill or confirm_tone." };
  }
  if (typeof req.revision !== "number" || !Number.isFinite(req.revision)) {
    return { ok: false, status: 400, error: "revision is required." };
  }
  if (req.revision !== pkg.revision) {
    return {
      ok: false,
      status: 409,
      error: `This item has moved on (revision ${pkg.revision}, you sent ${req.revision}). Refresh and review the latest version.`,
    };
  }
  if (pkg.status === "blocked") {
    return { ok: false, status: 409, error: "Blocked items are read-only." };
  }
  if (pkg.pendingAction) {
    return {
      ok: false,
      status: 409,
      error: `Waiting for n8n to confirm the last action (${pkg.pendingAction.action}). Retry it instead of sending a new one.`,
    };
  }
  if (req.action === "mark_stale") {
    const row = pkg.platforms.find((p) => p.platform === req.platform);
    if (!req.platform || !row) {
      return { ok: false, status: 400, error: "mark_stale needs a platform that's on this package." };
    }
    if (platformStatus(pkg, row) !== "published_private") {
      return { ok: false, status: 409, error: `${req.platform} isn't a private upload, so it can't be marked out of date.` };
    }
    return { ok: true };
  }
  if (req.action === "pick_title") {
    if (req.platform !== "youtube") {
      return { ok: false, status: 400, error: "pick_title is only for platform youtube." };
    }
    const row = pkg.platforms.find((p) => p.platform === "youtube");
    if (!row) return { ok: false, status: 400, error: "This package has no YouTube row." };
    if (platformStatus(pkg, row) !== "held_title") {
      return { ok: false, status: 409, error: "YouTube isn't held for its title." };
    }
    const opts = youtubeTitleOptions(pkg);
    const i = req.titleIndex;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= opts.length) {
      return { ok: false, status: 400, error: `titleIndex must be an integer from 0 to ${Math.max(0, opts.length - 1)}.` };
    }
    return { ok: true };
  }
  if (req.action === "mark_manual_done") {
    const row = pkg.platforms.find((p) => p.platform === req.platform);
    if (!req.platform || !row) {
      return { ok: false, status: 400, error: "mark_manual_done needs a platform that's on this package." };
    }
    if (platformStatus(pkg, row) !== "awaiting_manual") {
      return { ok: false, status: 409, error: `${req.platform} isn't waiting to be finished by hand.` };
    }
    return { ok: true };
  }
  if (req.action === "confirm_tone") {
    if (!pkg.sensitive) {
      return { ok: false, status: 400, error: "confirm_tone is only for SENSITIVE items." };
    }
    if (req.toneChecked !== true) {
      return { ok: false, status: 400, error: "confirm_tone needs toneChecked: true." };
    }
    if (pkg.status === "killed" || pkg.status === "revising") {
      return { ok: false, status: 409, error: `Nothing to confirm: this item is ${pkg.status}.` };
    }
    if (toneConfirmedForCurrent(pkg)) {
      return { ok: false, status: 409, error: `Tone already confirmed for revision ${pkg.revision}.` };
    }
    return { ok: true };
  }
  if (!isAwaitingReview(pkg)) {
    return {
      ok: false,
      status: 409,
      error: `Only items with a platform still in review can be actioned (this one is ${pkg.status}).`,
    };
  }

  const platforms = req.platforms ?? [];
  const known = new Set(pkg.platforms.map((p) => p.platform));
  for (const p of platforms) {
    if (!(PLATFORM_IDS as readonly string[]).includes(p) || !known.has(p)) {
      return { ok: false, status: 400, error: `Unknown platform: ${p}` };
    }
  }

  if (req.action === "approve") {
    if (req.toneChecked !== undefined && typeof req.toneChecked !== "boolean") {
      return { ok: false, status: 400, error: "toneChecked must be true or false." };
    }
    if (pkg.sensitive && req.toneChecked !== true) {
      return {
        ok: false,
        status: 400,
        error: "Sensitive item: tick 'I've checked tone and CTA' before approving.",
      };
    }
    if (platforms.length === 0) {
      return { ok: false, status: 400, error: "Choose at least one platform to approve." };
    }
    const titleOptions = youtubeTitleOptions(pkg);
    if (platforms.includes("youtube") && titleOptions.length > 0) {
      if (!req.selectedTitle) {
        return { ok: false, status: 400, error: "Pick a YouTube title on the YouTube tab before approving YouTube." };
      }
      if (!titleOptions.includes(req.selectedTitle)) {
        return { ok: false, status: 400, error: "selectedTitle must be one of the YouTube title options." };
      }
    }
    const open = new Set(platformsInReview(pkg));
    const decided = platforms.filter((p) => !open.has(p));
    if (decided.length) {
      return {
        ok: false,
        status: 409,
        error: `Already decided in the sheet: ${decided.join(", ")}. Only platforms still in review can be approved.`,
      };
    }
    return { ok: true };
  }

  if (req.action === "reject") {
    if (isAtCap(pkg)) {
      return {
        ok: false,
        status: 409,
        error: `Revision cap reached (${pkg.revisionCount}/${pkg.revisionCap}). Kill the item instead.`,
      };
    }
    const stages = req.stages ?? [];
    for (const s of stages) {
      if (!(REVIEW_STAGES as readonly string[]).includes(s)) {
        return { ok: false, status: 400, error: `Unknown stage: ${s}` };
      }
    }
    if (!req.feedback || !req.feedback.trim()) {
      return { ok: false, status: 400, error: "Feedback is required to reject." };
    }
    if (stages.length === 0) {
      return { ok: false, status: 400, error: "Tick at least one stage to redo." };
    }
    if (stages.length === 1 && stages[0] === "copy" && platforms.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "Copy-only revisions need at least one platform ticked.",
      };
    }
    return { ok: true };
  }

  // kill
  if (!isAtCap(pkg)) {
    return {
      ok: false,
      status: 409,
      error: "Kill is only available once the revision cap is reached. Reject instead.",
    };
  }
  return { ok: true };
}

export function youtubeTitleOptions(pkg: Pick<ContentPackage, "script">): string[] {
  const opts = pkg.script?.youtubeTitleOptions;
  return Array.isArray(opts) ? opts.filter((t) => typeof t === "string" && t.trim()) : [];
}

export function estimateRedoCostGbp(
  estimates: StageCostEstimatesGbp | undefined,
  stages: ReviewStage[]
): number {
  if (!estimates) return 0;
  return stages.reduce((sum, s) => sum + (estimates[s] ?? 0), 0);
}

/** Composed post text as it would be published: text, CTA, hashtags. */
export function composedCopy(p: PlatformCopy): string {
  const tags = (p.hashtags ?? [])
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  return [p.text, p.cta, tags].filter((s) => s && s.trim()).join("\n\n");
}

/** Count user-perceived characters roughly (code points, not UTF-16 units). */
export function charCount(s: string | undefined | null): number {
  return s ? Array.from(s).length : 0;
}

export const DEFAULT_CHAR_LIMITS: Partial<Record<PlatformId, number>> = {
  facebook: 2200,
  instagram: 2200,
  threads: 500,
  bluesky: 300,
  tiktok: 2200,
  lemon8: 1000,
};

export const YOUTUBE_TITLE_LIMIT = 100;
export const YOUTUBE_DESCRIPTION_LIMIT = 5000;

export function formatGbp(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(n);
}

export function formatLondon(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
