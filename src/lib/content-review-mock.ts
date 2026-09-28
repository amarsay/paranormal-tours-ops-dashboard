import type {
  ContentPackage,
  PlatformCopy,
  PlatformId,
  PlatformStatus,
  StageCostEstimatesGbp,
} from "./content-review-types";

/**
 * EXAMPLE DATA ONLY. Placeholder packages so /review can be built and
 * demoed before n8n posts real packages. Every subject starts with
 * "EXAMPLE —" and no text here describes a real place or claim.
 */

export const MOCK_MONTH_TO_DATE_GBP = 12.4;

const EXAMPLE_STAGE_COSTS: StageCostEstimatesGbp = {
  script: 0.03,
  visuals: 0.28,
  voice: 0.07,
  music: 0,
  copy: 0.02,
};

function londonEvening(daysAhead: number, hour: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  // BST-safe approximation: store as UTC at (hour - 1); UI renders in Europe/London.
  d.setUTCHours(hour - 1, 0, 0, 0);
  return d.toISOString();
}

function examplePlatforms(
  tag: string,
  opts: {
    sensitive?: boolean;
    statuses?: Partial<Record<PlatformId, PlatformStatus>>;
    selectedTitle?: string | null;
  } = {}
): PlatformCopy[] {
  const at = londonEvening(1, 19);
  const cta = opts.sensitive
    ? "Read the full Codex entry (example CTA)."
    : "Read the full Codex entry or browse tours (example CTA).";
  const base = `EXAMPLE placeholder copy for ${tag}. Lorem ipsum dolor sit amet, this is not a real story and makes no claim.`;
  const rows: PlatformCopy[] = [
    {
      platform: "facebook",
      text: `${base} Longer Facebook caption placeholder.`,
      hashtags: ["ExampleOnly", "ParanormalTours"],
      cta,
      charLimit: 2200,
      scheduleAt: at,
      status: "review",
    },
    {
      platform: "instagram",
      text: `${base} Instagram caption placeholder.`,
      hashtags: ["ExampleOnly", "ParanormalTours", "CodexIgnota"],
      cta,
      charLimit: 2200,
      scheduleAt: at,
      status: "review",
    },
    {
      platform: "threads",
      text: `${base} Threads placeholder.`,
      hashtags: ["ExampleOnly"],
      cta,
      charLimit: 500,
      scheduleAt: at,
      status: "review",
    },
    {
      platform: "bluesky",
      // Deliberately over the 300 limit so the red counter can be seen.
      text: `${base} Bluesky placeholder that is deliberately a bit too long so the character counter turns red in the mock. Consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
      hashtags: ["ExampleOnly"],
      cta,
      charLimit: 300,
      scheduleAt: at,
      status: "review",
    },
    {
      platform: "youtube",
      title: `EXAMPLE — ${tag} (placeholder Short title)`,
      description: `${base}\n\nPlaceholder YouTube description. AI-generated illustration.`,
      tags: ["example", "placeholder"],
      hashtags: ["Shorts", "ExampleOnly"],
      cta,
      charLimit: 5000,
      scheduleAt: at,
      status: "review",
    },
    {
      platform: "tiktok",
      text: `${base} TikTok placeholder.`,
      hashtags: ["ExampleOnly", "fyp"],
      cta,
      charLimit: 2200,
      scheduleAt: at,
      status: "review",
    },
    {
      platform: "lemon8",
      manual: true,
      title: `EXAMPLE — ${tag}`,
      text: `${base} Lemon8 manual-post placeholder.`,
      hashtags: ["ExampleOnly", "ParanormalTours"],
      cta,
      charLimit: 1000,
      status: "review",
    },
    {
      platform: "website",
      title: `EXAMPLE — ${tag}`,
      excerpt: "Placeholder excerpt for the website post. Not real content.",
      bodyHtml:
        "<p><strong>EXAMPLE.</strong> Placeholder body paragraph one.</p><p>Placeholder paragraph two. The published YouTube Short would be embedded here.</p>",
      category: "Example category",
      scheduleAt: londonEvening(1, 20),
      status: "review",
    },
  ];
  return rows.map((r) => {
    const status = opts.statuses?.[r.platform] ?? r.status;
    // Approved YouTube rows carry the sheet's title pick (null = default option 1).
    return r.platform === "youtube" && status !== "review" ? { ...r, status, selectedTitle: opts.selectedTitle ?? null } : { ...r, status };
  });
}

const exampleScript = (tag: string) => ({
  hook: `EXAMPLE hook line for ${tag}?`,
  narration:
    "EXAMPLE narration placeholder. Lorem ipsum dolor sit amet. This paragraph stands in for roughly 200 words of source-locked narration. Status: example data, not a real claim.",
  scenes: [
    { index: 1, text: "Placeholder hook scene", visual: "Placeholder still, push-in", durationSec: 2 },
    { index: 2, text: "Placeholder stakes scene", visual: "Placeholder still, pan left", durationSec: 5 },
    { index: 3, text: "Placeholder case beat", visual: "Placeholder still, pull-out", durationSec: 5 },
    { index: 4, text: "Placeholder payoff and CTA", visual: "Credibility chip animates in", durationSec: 5 },
  ],
  youtubeTitleOptions: [
    `EXAMPLE title option A — ${tag}`,
    `EXAMPLE title option B — what happened at ${tag}?`,
    `EXAMPLE title option C — the ${tag} placeholder`,
  ],
  hookOverlay: `EXAMPLE overlay: “${tag}?”`,
  openQuestion: "EXAMPLE open question: what would you have done?",
  coverFrameScene: 3,
});

export function buildMockPackages(): ContentPackage[] {
  const now = new Date().toISOString();
  const sheetUrl = "https://example.com/placeholder-sheet";

  return [
    {
      packageId: "cp_example_001",
      revision: 1,
      status: "review",
      subject: "EXAMPLE — Placeholder castle story (standard review)",
      sheetRef: { tab: "Agent Stack Results", row: 101, sheetUrl: `${sheetUrl}#row=101` },
      credibilityLabel: "REPORTED",
      credibility: { labels: ["REPORTED", "FOLKLORE"], notes: "Example notes only." },
      aiIllustration: true,
      sensitive: false,
      blockedReason: null,
      video: {
        url: "/review-mock/example-9x16.mp4",
        poster: "/review-mock/example-poster.jpg",
        captionsVtt: "/review-mock/example-captions.vtt",
        durationSec: 6,
      },
      script: exampleScript("item one"),
      platforms: examplePlatforms("item one"),
      revisionCount: 0,
      revisionCap: 3,
      costEstimateGbp: 0.45,
      costActualGbp: 0.41,
      monthToDateGbp: MOCK_MONTH_TO_DATE_GBP,
      stageCostEstimatesGbp: EXAMPLE_STAGE_COSTS,
      history: [{ revision: 1, action: "generated", stages: [], feedback: "", at: now }],
      updatedAt: now,
      example: true,
    },
    {
      packageId: "cp_example_002",
      revision: 2,
      status: "review",
      subject: "EXAMPLE — Placeholder sensitive site (tone check required)",
      sheetRef: { tab: "Agent Stack Results", row: 102, sheetUrl: `${sheetUrl}#row=102` },
      credibilityLabel: "TESTIMONY",
      aiIllustration: true,
      sensitive: true,
      blockedReason: null,
      video: {
        url: null,
        poster: "/review-mock/example-poster.jpg",
        captionsVtt: null,
        durationSec: 68,
      },
      script: exampleScript("item two"),
      platforms: examplePlatforms("item two", { sensitive: true }),
      revisionCount: 1,
      revisionCap: 3,
      costEstimateGbp: 0.45,
      costActualGbp: 0.52,
      monthToDateGbp: MOCK_MONTH_TO_DATE_GBP,
      stageCostEstimatesGbp: EXAMPLE_STAGE_COSTS,
      history: [
        { revision: 1, action: "generated", stages: [], feedback: "", at: now },
        {
          revision: 1,
          action: "reject",
          stages: ["copy"],
          platforms: ["instagram"],
          feedback: "EXAMPLE feedback: softer tone, drop the visit CTA.",
          actor: "founder",
          at: now,
        },
      ],
      updatedAt: now,
      example: true,
    },
    {
      packageId: "cp_example_003",
      revision: 4,
      status: "review",
      subject: "EXAMPLE — Placeholder item at the revision cap (Kill only)",
      sheetRef: { tab: "Agent Stack Results", row: 103, sheetUrl: `${sheetUrl}#row=103` },
      credibilityLabel: "FOLKLORE",
      aiIllustration: true,
      sensitive: false,
      blockedReason: null,
      video: null,
      script: exampleScript("item three"),
      platforms: examplePlatforms("item three"),
      revisionCount: 3,
      revisionCap: 3,
      costEstimateGbp: 0.45,
      costActualGbp: 1.12,
      monthToDateGbp: MOCK_MONTH_TO_DATE_GBP,
      stageCostEstimatesGbp: EXAMPLE_STAGE_COSTS,
      history: [1, 2, 3].map((r) => ({
        revision: r,
        action: "reject" as const,
        stages: ["script" as const, "voice" as const],
        feedback: `EXAMPLE feedback for revision ${r}.`,
        actor: "founder",
        at: now,
      })),
      updatedAt: now,
      example: true,
    },
    {
      packageId: "cp_example_004",
      revision: 0,
      status: "blocked",
      subject: "EXAMPLE — Placeholder row skipped (thin source)",
      sheetRef: { tab: "Agent Stack Results", row: 104, sheetUrl: `${sheetUrl}#row=104` },
      credibilityLabel: "FOLKLORE",
      aiIllustration: false,
      sensitive: false,
      blockedReason: "thin_source",
      video: null,
      script: { hook: "", narration: "", scenes: [] },
      platforms: [],
      revisionCount: 0,
      revisionCap: 3,
      costEstimateGbp: 0,
      costActualGbp: 0.01,
      monthToDateGbp: MOCK_MONTH_TO_DATE_GBP,
      stageCostEstimatesGbp: EXAMPLE_STAGE_COSTS,
      history: [],
      updatedAt: now,
      example: true,
    },
    {
      // Partial approval: five rows approved + Bluesky declined in the sheet,
      // Website still `review`, so the card stays in "Awaiting review" even
      // though the package-level status already says approved.
      packageId: "cp_example_005",
      revision: 1,
      status: "approved",
      subject: "EXAMPLE — Partial approval from the sheet (Website still in review)",
      sheetRef: { tab: "Agent Stack Results", row: 105, sheetUrl: `${sheetUrl}#row=105` },
      credibilityLabel: "DOCUMENTED",
      aiIllustration: true,
      sensitive: false,
      toneCheckedRevision: null,
      blockedReason: null,
      video: {
        url: "/review-mock/example-9x16.mp4",
        poster: "/review-mock/example-poster.jpg",
        captionsVtt: "/review-mock/example-captions.vtt",
        durationSec: 6,
      },
      script: exampleScript("item five"),
      coverImageUrl: "/review-mock/example-poster.jpg",
      platforms: examplePlatforms("item five", {
        statuses: {
          facebook: "approved",
          instagram: "approved",
          threads: "approved",
          bluesky: "not_approved",
          youtube: "approved",
          tiktok: "approved",
          lemon8: "approved",
          website: "review",
        },
      }),
      revisionCount: 0,
      revisionCap: 3,
      costEstimateGbp: 0.45,
      costActualGbp: 0.44,
      monthToDateGbp: MOCK_MONTH_TO_DATE_GBP,
      stageCostEstimatesGbp: EXAMPLE_STAGE_COSTS,
      history: [{ revision: 1, action: "generated", stages: [], feedback: "", at: now }],
      updatedAt: now,
      lastSource: "sheet",
      lastSourceAt: now,
      example: true,
    },
    {
      // Held: sensitive item approved in the sheet, but tone_checked isn't TRUE
      // for this revision (Instagram + TikTok held_tone), and the hand-typed
      // YouTube title failed the banned-phrase check (held_title).
      packageId: "cp_example_006",
      revision: 1,
      status: "approved",
      subject: "EXAMPLE — Sensitive item held by the publisher (tone check + title check)",
      sheetRef: { tab: "Agent Stack Results", row: 106, sheetUrl: `${sheetUrl}#row=106` },
      credibilityLabel: "TESTIMONY",
      aiIllustration: true,
      sensitive: true,
      toneCheckedRevision: null,
      blockedReason: null,
      video: {
        url: null,
        poster: "/review-mock/example-poster.jpg",
        captionsVtt: null,
        durationSec: 64,
      },
      script: exampleScript("item six"),
      platforms: examplePlatforms("item six", {
        sensitive: true,
        // Hand-typed in the sheet (not one of the options) and failed the banned-phrase check.
        selectedTitle: "EXAMPLE hand-typed title with a BANNED placeholder phrase",
        statuses: {
          facebook: "approved",
          instagram: "held_tone",
          threads: "approved",
          bluesky: "approved",
          youtube: "held_title",
          tiktok: "held_tone",
          lemon8: "approved",
          website: "approved",
        },
      }),
      revisionCount: 0,
      revisionCap: 3,
      costEstimateGbp: 0.45,
      costActualGbp: 0.47,
      monthToDateGbp: MOCK_MONTH_TO_DATE_GBP,
      stageCostEstimatesGbp: EXAMPLE_STAGE_COSTS,
      history: [{ revision: 1, action: "generated", stages: [], feedback: "", at: now }],
      updatedAt: now,
      lastSource: "sheet",
      lastSourceAt: now,
      example: true,
    },
    {
      // Approved and mostly out: TikTok (inbox draft) and Lemon8 must be
      // finished by hand; YouTube is a PRIVATE upload while the Google API
      // audit is pending, so it is not live.
      packageId: "cp_example_008",
      revision: 1,
      status: "approved",
      subject: "EXAMPLE — Finish TikTok by hand (Lemon8 posted by hand; YouTube uploaded private)",
      sheetRef: { tab: "Agent Stack Results", row: 108, sheetUrl: `${sheetUrl}#row=108` },
      credibilityLabel: "FOLKLORE",
      aiIllustration: true,
      sensitive: false,
      toneCheckedRevision: null,
      blockedReason: null,
      video: {
        url: "/review-mock/example-9x16.mp4",
        poster: "/review-mock/example-poster.jpg",
        captionsVtt: "/review-mock/example-captions.vtt",
        durationSec: 6,
      },
      coverImageUrl: "/review-mock/example-poster.jpg",
      script: exampleScript("item eight"),
      platforms: examplePlatforms("item eight", {
        selectedTitle: "EXAMPLE title option A — item eight",
        statuses: {
          facebook: "posted",
          instagram: "scheduled",
          threads: "posted",
          bluesky: "posted",
          youtube: "published_private",
          tiktok: "awaiting_manual",
          lemon8: "posted_manual",
          website: "scheduled",
        },
      }).map((r) =>
        r.platform === "lemon8" ? { ...r, postedAt: new Date(Date.now() - 45 * 60_000).toISOString(), postedRevision: 1 } : r
      ),
      revisionCount: 0,
      revisionCap: 3,
      costEstimateGbp: 0.45,
      costActualGbp: 0.43,
      monthToDateGbp: MOCK_MONTH_TO_DATE_GBP,
      stageCostEstimatesGbp: EXAMPLE_STAGE_COSTS,
      history: [{ revision: 1, action: "generated", stages: [], feedback: "", at: now }],
      updatedAt: now,
      lastSource: "sheet",
      lastSourceAt: now,
      example: true,
    },
    {
      // QA flagged: the render failed automatic QA twice, so it arrives flagged.
      // Approve is still allowed (founder's call).
      packageId: "cp_example_007",
      revision: 1,
      status: "review",
      subject: "EXAMPLE — Render flagged by automatic QA (two failed checks)",
      sheetRef: { tab: "Agent Stack Results", row: 107, sheetUrl: `${sheetUrl}#row=107` },
      credibilityLabel: "REPORTED",
      aiIllustration: true,
      sensitive: false,
      toneCheckedRevision: null,
      blockedReason: null,
      video: {
        url: "/review-mock/example-9x16.mp4",
        poster: "/review-mock/example-poster.jpg",
        captionsVtt: "/review-mock/example-captions.vtt",
        durationSec: 6,
      },
      script: exampleScript("item seven"),
      qaFlags: [
        { check: "duration", detail: "EXAMPLE: 78s rendered; target 55–70s." },
        { check: "loudness", detail: "EXAMPLE: -9.1 LUFS integrated; target -14 ±1." },
      ],
      platforms: examplePlatforms("item seven"),
      revisionCount: 0,
      revisionCap: 3,
      costEstimateGbp: 0.45,
      costActualGbp: 0.61,
      monthToDateGbp: MOCK_MONTH_TO_DATE_GBP,
      stageCostEstimatesGbp: EXAMPLE_STAGE_COSTS,
      history: [{ revision: 1, action: "generated", stages: [], feedback: "", at: now }],
      updatedAt: now,
      lastSource: "n8n",
      lastSourceAt: now,
      example: true,
    },
  ];
}
