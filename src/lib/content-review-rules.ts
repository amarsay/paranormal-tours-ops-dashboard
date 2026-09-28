import type {
  ContentPackage,
  PlatformCopy,
  PlatformId,
  ReviewActionRequest,
  ReviewStage,
  StageCostEstimatesGbp,
} from "./content-review-types";
import { PLATFORM_IDS, REVIEW_STAGES } from "./content-review-types";

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
  if (!["approve", "reject", "kill"].includes(req.action)) {
    return { ok: false, status: 400, error: "Action must be approve, reject or kill." };
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
  if (pkg.status !== "review") {
    return {
      ok: false,
      status: 409,
      error: `Only items in review can be actioned (this one is ${pkg.status}).`,
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
    if (pkg.sensitive && !req.toneChecked) {
      return {
        ok: false,
        status: 400,
        error: "Sensitive item: tick 'I've checked tone and CTA' before approving.",
      };
    }
    if (platforms.length === 0) {
      return { ok: false, status: 400, error: "Choose at least one platform to approve." };
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
