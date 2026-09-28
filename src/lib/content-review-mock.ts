import type {
  ContentPackage,
  PlatformCopy,
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

function examplePlatforms(tag: string, opts: { sensitive?: boolean } = {}): PlatformCopy[] {
  const at = londonEvening(1, 19);
  const cta = opts.sensitive
    ? "Read the full Codex entry (example CTA)."
    : "Read the full Codex entry or browse tours (example CTA).";
  const base = `EXAMPLE placeholder copy for ${tag}. Lorem ipsum dolor sit amet, this is not a real story and makes no claim.`;
  return [
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
});

export function buildMockPackages(): ContentPackage[] {
  const now = new Date().toISOString();
  const sheetUrl = "https://example.com/placeholder-sheet";

  return [
    {
      contentId: "cp_example_001",
      revision: 1,
      status: "review",
      subject: "EXAMPLE — Placeholder castle story (standard review)",
      source: { tab: "Agent Stack Results", row: 101, sheetUrl: `${sheetUrl}#row=101` },
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
      contentId: "cp_example_002",
      revision: 2,
      status: "review",
      subject: "EXAMPLE — Placeholder sensitive site (tone check required)",
      source: { tab: "Agent Stack Results", row: 102, sheetUrl: `${sheetUrl}#row=102` },
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
      contentId: "cp_example_003",
      revision: 4,
      status: "review",
      subject: "EXAMPLE — Placeholder item at the revision cap (Kill only)",
      source: { tab: "Agent Stack Results", row: 103, sheetUrl: `${sheetUrl}#row=103` },
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
      contentId: "cp_example_004",
      revision: 0,
      status: "blocked",
      subject: "EXAMPLE — Placeholder row skipped (thin source)",
      source: { tab: "Agent Stack Results", row: 104, sheetUrl: `${sheetUrl}#row=104` },
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
  ];
}
