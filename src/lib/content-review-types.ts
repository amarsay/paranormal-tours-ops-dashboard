/**
 * Content Review contracts (Billy spec v0.1 sections 3, 4 and 9).
 * Shared by the API routes, the store and the /review UI.
 */

/** Package-level status (the sheet is the source of truth; n8n posts it here). */
export const CONTENT_STATUSES = [
  "review",
  "revising",
  "approved",
  "scheduled",
  "posted",
  "failed",
  "killed",
  "blocked",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/**
 * Per-platform row status. "not_approved" = unticked on a partial approve.
 * "held_tone" = sensitive row the Publish poller is holding because the
 * sheet's tone_checked isn't TRUE for the current revision.
 * "held_title" = youtube row held because a hand-typed selected_title failed
 * the banned-phrase check.
 * "awaiting_manual" = founder must finish in the app (TikTok inbox draft,
 * Lemon8 until an API is confirmed). "published_private" = YouTube uploaded
 * as private while the Google API audit is pending (NOT live).
 * "posted_manual" = terminal: finished by hand (set by n8n after mark_manual_done).
 */
export const PLATFORM_STATUSES = [
  "review",
  "approved",
  "not_approved",
  "held_tone",
  "held_title",
  "awaiting_manual",
  "posted_manual",
  "published_private",
  "killed",
  "scheduled",
  "posted",
  "failed",
] as const;
export type PlatformStatus = (typeof PLATFORM_STATUSES)[number];

/** Legacy values still accepted on inbound POSTs (mapped on the way in). */
export const LEGACY_CONTENT_STATUS: Record<string, ContentStatus> = { rejected: "killed" };
export const LEGACY_PLATFORM_STATUS: Record<string, PlatformStatus> = {
  skipped: "not_approved",
  rejected: "killed",
};

/** Who last wrote the package into the dashboard cache. */
export const UPDATE_SOURCES = ["sheet", "n8n"] as const;
export type UpdateSource = (typeof UPDATE_SOURCES)[number];

export const CREDIBILITY_LABELS = [
  "DOCUMENTED",
  "REPORTED",
  "TESTIMONY",
  "FOLKLORE",
] as const;
export type CredibilityLabel = (typeof CREDIBILITY_LABELS)[number];

export const REVIEW_STAGES = [
  "script",
  "visuals",
  "voice",
  "music",
  "copy",
] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];

export const PLATFORM_IDS = [
  "facebook",
  "instagram",
  "threads",
  "bluesky",
  "youtube",
  "tiktok",
  "lemon8",
  "website",
] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  bluesky: "Bluesky",
  youtube: "YouTube",
  tiktok: "TikTok",
  lemon8: "Lemon8",
  website: "Website",
};

export const BLOCKED_REASONS = ["thin_source", "banned_phrase"] as const;
export type BlockedReason = (typeof BLOCKED_REASONS)[number] | string;

/** Where the item lives in the Google Sheet (row reference only; no creds). */
export interface SheetRef {
  tab: string;
  row: number;
  sheetUrl?: string | null;
}

export interface ContentVideo {
  url?: string | null;
  poster?: string | null;
  captionsVtt?: string | null;
  durationSec?: number | null;
}

export interface ScriptScene {
  index?: number;
  text?: string;
  visual?: string;
  durationSec?: number;
}

export interface ContentScript {
  hook: string;
  narration: string;
  scenes: ScriptScene[];
  /** Candidate YouTube titles; founder picks one on the YouTube tab (sent as selectedTitle). */
  youtubeTitleOptions?: string[];
  /** On-screen text over the first seconds. */
  hookOverlay?: string;
  /** Question the video leaves open (comment prompt). */
  openQuestion?: string;
  /** Scene used for the cover/thumbnail frame (scene index or label). */
  coverFrameScene?: number | string;
}

/** Automatic post-render QA; a video that fails twice arrives flagged. */
export const QA_CHECKS = ["duration", "first_word", "scene_length", "loudness"] as const;
export type QaCheck = (typeof QA_CHECKS)[number];
export interface QaFlag {
  check: QaCheck;
  detail: string;
}

interface PlatformBase {
  platform: PlatformId;
  text?: string;
  hashtags?: string[];
  cta?: string;
  charLimit?: number;
  scheduleAt?: string | null;
  status?: PlatformStatus;
  /** posted_manual (sheet sync): when it was posted and for which revision. */
  postedAt?: string | null;
  postedRevision?: number | null;
}

export interface SocialPlatformCopy extends PlatformBase {
  platform: "facebook" | "instagram" | "threads" | "bluesky" | "tiktok";
}

export interface YoutubePlatformCopy extends PlatformBase {
  platform: "youtube";
  /** Title chosen from script.youtubeTitleOptions; the sheet is truth (null = default option 1). */
  selectedTitle?: string | null;
  title?: string;
  description?: string;
  tags?: string[];
}

export interface Lemon8PlatformCopy extends PlatformBase {
  platform: "lemon8";
  manual: true;
  title?: string;
}

export interface WebsitePlatformCopy extends PlatformBase {
  platform: "website";
  title?: string;
  excerpt?: string;
  bodyHtml?: string;
  category?: string;
}

export type PlatformCopy =
  | SocialPlatformCopy
  | YoutubePlatformCopy
  | Lemon8PlatformCopy
  | WebsitePlatformCopy;

export type StageCostEstimatesGbp = Partial<Record<ReviewStage, number>>;

export interface ContentHistoryEntry {
  revision: number;
  action?: ReviewAction | "generated" | "note";
  stages: ReviewStage[];
  platforms?: PlatformId[];
  feedback: string;
  actor?: string;
  at: string;
}

/** Real mode only: an action sent to n8n that the sheet hasn't confirmed yet. */
export interface PendingAction {
  action: ReviewAction;
  /** When the action was first sent (same as payload.at). */
  at: string;
  /** Last (re)send time; the "no response" warning counts from here. */
  lastSentAt?: string;
  attempts?: number;
  /** Exact payload, so Retry resends the same body (same revision → n8n dedupes). */
  payload: ReviewActionPayload;
}

export interface ContentPackage {
  packageId: string;
  revision: number;
  status: ContentStatus;
  subject: string;
  sheetRef: SheetRef;
  credibilityLabel: CredibilityLabel;
  /** Optional per-claim labels + notes (spec section 3). */
  credibility?: { labels?: string[]; notes?: string };
  aiIllustration: boolean;
  /** Display-only here: set by the pipeline; an inbound false never clears a stored true. */
  sensitive: boolean;
  /** Revision the founder confirmed tone/CTA for (null = not confirmed). Resets on a new revision. */
  toneCheckedRevision?: number | null;
  blockedReason?: BlockedReason | null;
  video?: ContentVideo | null;
  /** Optional cover/thumbnail image, shown on the YouTube tab. */
  coverImageUrl?: string | null;
  script: ContentScript;
  /** Non-empty = QA flagged (approve still allowed; founder's call). */
  qaFlags?: QaFlag[];
  platforms: PlatformCopy[];
  revisionCount: number;
  revisionCap: number;
  costEstimateGbp?: number | null;
  costActualGbp?: number | null;
  monthToDateGbp?: number | null;
  stageCostEstimatesGbp?: StageCostEstimatesGbp;
  history: ContentHistoryEntry[];
  updatedAt: string;
  /** Origin of the last inbound write ("sheet" = n8n relaying a sheet edit). */
  lastSource?: UpdateSource | null;
  lastSourceAt?: string | null;
  pendingAction?: PendingAction | null;
  /** True for seeded example packages (never real content). */
  example?: boolean;
}

export type ReviewAction = "approve" | "reject" | "kill" | "confirm_tone" | "mark_manual_done";
export const REVIEW_ACTIONS: ReviewAction[] = ["approve", "reject", "kill", "confirm_tone", "mark_manual_done"];

/** Dashboard → n8n webhook (single URL; body.action = approve | reject | kill). */
export interface DecisionActionPayload {
  action: "approve" | "reject" | "kill";
  packageId: string;
  revision: number;
  platforms: PlatformId[];
  stages: ReviewStage[];
  feedback: string;
  /** Approve only: the SENSITIVE "checked tone and CTA" tick (must be true when sensitive). */
  toneChecked?: boolean;
  /** Approve only, when youtube is approved and title options exist: the chosen title. */
  selectedTitle?: string;
  actor: string;
  at: string;
}

/** Dashboard → n8n webhook: founder ticks tone on a held/approved sensitive item. */
export interface ConfirmToneActionPayload {
  action: "confirm_tone";
  packageId: string;
  revision: number;
  toneChecked: true;
  actor: string;
  at: string;
}

/** Dashboard → n8n webhook: founder finished a manual post (TikTok draft / Lemon8) in the app. */
export interface ManualDoneActionPayload {
  action: "mark_manual_done";
  packageId: string;
  revision: number;
  platform: PlatformId;
  actor: string;
  at: string;
}

export type ReviewActionPayload = DecisionActionPayload | ConfirmToneActionPayload | ManualDoneActionPayload;

/** Browser → dashboard action route body. */
export interface ReviewActionRequest {
  action: ReviewAction;
  revision: number;
  platforms?: PlatformId[];
  stages?: ReviewStage[];
  feedback?: string;
  toneChecked?: boolean;
  selectedTitle?: string;
  /** mark_manual_done only: the platform row finished by hand. */
  platform?: PlatformId;
  /** Real mode: resend the stored pendingAction payload unchanged. */
  retry?: boolean;
}

export interface ContentReviewMode {
  /** true when N8N_REVIEW_WEBHOOK_URL / N8N_WEBHOOK_SECRET are not both set. */
  mock: boolean;
  /** true when REVIEW_ADMIN_PASSWORD is set (passcode gate active). */
  protected: boolean;
  storage: "redis" | "memory";
}

export interface ContentReviewListResponse {
  packages: ContentPackage[];
  mode: ContentReviewMode;
  budget: BudgetSummary;
  updatedAt: string;
}

export interface BudgetSummary {
  monthToDateGbp: number;
  budgetGbp: number;
  hardStopGbp: number;
  example: boolean;
}

export interface ContentReviewSummary {
  /** Cards needing the founder: a platform row in review, or held for a tone check. */
  pending: number;
  /** Cards with a platform row held_tone or held_title. */
  held: number;
  /** Cards with a platform row awaiting_manual (finish in the app). */
  manual: number;
  blocked: number;
  mock: boolean;
}

export const BUDGET_GBP = 35;
export const HARD_STOP_GBP = 33;
export const DEFAULT_REVISION_CAP = 3;
/** Real mode: warn when n8n hasn't posted the new state back within this long. */
export const PENDING_WARN_MS = 10 * 60 * 1000;
