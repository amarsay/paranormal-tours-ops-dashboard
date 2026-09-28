/**
 * Content Review contracts (Billy spec v0.1 sections 3, 4 and 9).
 * Shared by the API routes, the store and the /review UI.
 */

export const CONTENT_STATUSES = [
  "review",
  "revising",
  "approved",
  "scheduled",
  "posted",
  "failed",
  "rejected",
  "blocked",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Per-platform status: item statuses plus "skipped" (unticked on a partial approve). */
export type PlatformStatus = ContentStatus | "skipped";

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

export interface ContentSource {
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
}

interface PlatformBase {
  platform: PlatformId;
  text?: string;
  hashtags?: string[];
  cta?: string;
  charLimit?: number;
  scheduleAt?: string | null;
  status?: PlatformStatus;
}

export interface SocialPlatformCopy extends PlatformBase {
  platform: "facebook" | "instagram" | "threads" | "bluesky" | "tiktok";
}

export interface YoutubePlatformCopy extends PlatformBase {
  platform: "youtube";
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
  action?: "approve" | "reject" | "kill" | "generated";
  stages: ReviewStage[];
  platforms?: PlatformId[];
  feedback: string;
  actor?: string;
  at: string;
}

export interface ContentPackage {
  contentId: string;
  revision: number;
  status: ContentStatus;
  subject: string;
  source: ContentSource;
  credibilityLabel: CredibilityLabel;
  /** Optional per-claim labels + notes (spec section 3). */
  credibility?: { labels?: string[]; notes?: string };
  aiIllustration: boolean;
  sensitive: boolean;
  blockedReason?: BlockedReason | null;
  video?: ContentVideo | null;
  script: ContentScript;
  platforms: PlatformCopy[];
  revisionCount: number;
  revisionCap: number;
  costEstimateGbp?: number | null;
  costActualGbp?: number | null;
  monthToDateGbp?: number | null;
  stageCostEstimatesGbp?: StageCostEstimatesGbp;
  history: ContentHistoryEntry[];
  updatedAt: string;
  /** True for seeded example packages (never real content). */
  example?: boolean;
}

export type ReviewAction = "approve" | "reject" | "kill";

/** Dashboard → n8n webhook (spec section 4, plus "kill"). */
export interface ReviewActionPayload {
  action: ReviewAction;
  contentId: string;
  revision: number;
  platforms: PlatformId[];
  stages: ReviewStage[];
  feedback: string;
  actor: string;
  at: string;
}

/** Browser → dashboard action route body. */
export interface ReviewActionRequest {
  action: ReviewAction;
  revision: number;
  platforms?: PlatformId[];
  stages?: ReviewStage[];
  feedback?: string;
  toneChecked?: boolean;
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
  pending: number;
  blocked: number;
  mock: boolean;
}

export const BUDGET_GBP = 35;
export const HARD_STOP_GBP = 33;
export const DEFAULT_REVISION_CAP = 3;
