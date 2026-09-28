# Paranormal Tours — Agent Ops Dashboard

**Live:** [https://paranormal-tours-ops-dashboard.vercel.app/](https://paranormal-tours-ops-dashboard.vercel.app/)

Phone-friendly ops dashboard for the 31 Paranormal Tours specialist agents.

British English UI. Dark brand. **v2** adds shared live presence via HTTP (no websockets).

## Local development

```bash
cp .env.example .env.local
# set OPS_WRITE_TOKEN to any secret for local POSTs
npm install
npm run dev
```

Open http://localhost:3000

### Env vars

| Name | Required | Purpose |
|------|----------|---------|
| `OPS_WRITE_TOKEN` | Yes for POST | Bearer token for Spectre heartbeats |
| `UPSTASH_REDIS_REST_URL` | Vercel | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel | Upstash Redis REST token |

Without Upstash, the API uses an **in-memory Map** (fine for `next dev` / single Node process). On Vercel you **must** set Upstash or heartbeats will not persist across isolates.

## Live status API (Spectre contract)

Primary path (Spectre):

- `GET /api/agent-ops/status` — dashboard poll (no auth)
- `POST /api/agent-ops/status` — heartbeat (`Authorization: Bearer OPS_WRITE_TOKEN`)

Alias (same store):

- `GET|POST /api/live`

### Snapshot shape (GET)

```json
{
  "schemaVersion": 1,
  "updatedAt": "ISO-8601",
  "agents": {
    "billy": {
      "agentId": "billy",
      "agentName": "Billy",
      "status": "working",
      "taskTitle": "Ship landing polish",
      "notes": null,
      "correlationId": null,
      "handoffTo": null,
      "updatedAt": "ISO",
      "blockerReason": null,
      "taskState": "in_progress",
      "heartbeatAt": "ISO",
      "taskId": null,
      "presence": "working",
      "message": null
    }
  },
  "storage": "memory"
}
```


### Agent identity (required for writers)

**Prefer roster slug as `agentId`:** `spectre`, `billy`, `flo`, `kezza`, …  
Stored and returned ids are always roster slugs.

| What you POST | Result |
|---------------|--------|
| `agentId: "spectre"` | ✅ 200 |
| `agentId: "<uuid>"` **and** `agentName: "Spectre"` (or full title) | ✅ 200 → stored as `spectre` |
| `agentId: "<uuid>"` alone | ❌ 404 Unknown agent |

Do **not** rely on Grok Bot UUIDs alone. Spectre helper / daemon should write roster slugs.

Primary `status` / chip: `working | blocked | review | idle`.  
Optional Flo extras: `presence`, `taskState`, `heartbeatAt`, `blockerReason`, `taskId`, `message`.

`taskState`: `backlog | in_progress | blocked | review | done | failed`  
(aliases: `queued`→backlog, `working`→in_progress)

### POST heartbeat example

```bash
curl -sS -X POST http://localhost:3000/api/agent-ops/status \
  -H "Authorization: Bearer $OPS_WRITE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "billy",
    "presence": "working",
    "taskTitle": "Ship Codex Ignota landing polish",
    "taskState": "in_progress",
    "heartbeatAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

Agent cadence (Spectre): immediate on change; every **15s** while working/blocked/review; every **60s** while idle.

Dashboard polls GET every **5s**. Live JSON **wins** over localStorage for status / task title / heartbeat fields.

### Freshness (client)

- Live dot: heartbeat ≤30s (active) / ≤2m (idle)
- Stale: miss >90s (active) / >5m (idle)
- `done` pulses ~60s then idle; `failed` stays until new task
- `offline`: never checked in via live

## Mock stream (no Spectre / Upstash)

Advance the mock cycle (writes into the same store):

```bash
# each GET applies one scripted heartbeat tick
curl -sS http://localhost:3000/api/agent-ops/mock | jq .

# then read snapshot
curl -sS http://localhost:3000/api/agent-ops/status | jq .

# reset (requires token)
curl -sS -X POST http://localhost:3000/api/agent-ops/mock \
  -H "Authorization: Bearer $OPS_WRITE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reset":true}'
```

Open the Overview — KPIs, **Needs you** attention strip, and agent cards should update within ~5s.

For Spectre pointing at this box: `OPS_LIVE_BASE_URL=http://localhost:3000` (POST `/api/agent-ops/status`).

## Overview UI (v2)

- KPIs: Active now · Needs you · In flight · Done today (Europe/London) · Stale/offline
- Attention strip: blocked / review / failed with Unblock vs Review CTAs
- Agent cards with relative “Updated Xs ago” (no activity feed)

Local assign/board edits still work; the next live poll overlays remote presence.

## Deploy

Hosted on Vercel from [`amarsay/paranormal-tours-ops-dashboard`](https://github.com/amarsay/paranormal-tours-ops-dashboard). Set the three env vars in the Vercel project.

## Content Review (`/review`)

Founder review of daily video packages (Billy spec v0.1 + agreed contract changes). **The sheet is the only source of truth**: n8n writes the sheet and posts the resulting state here; the dashboard never holds Google credentials. Redis is a display cache.

| Route | Auth | Purpose |
|------|------|---------|
| `GET /api/content-review?status=review` | Review session (when passcode set) or `Bearer OPS_WRITE_TOKEN` | List packages + mode + budget (`review` = any platform row still `review`) |
| `POST /api/content-review` | `Bearer OPS_WRITE_TOKEN` | n8n / sheet sync upserts a package (rules below) |
| `POST /api/content-review/{packageId}/action` | Review session | `approve` / `reject` / `kill` / `confirm_tone` / `mark_manual_done`, or `{ retry: true, revision }` |
| `GET /api/content-review/summary` | Public (counts only) | `{ pending, held, manual, blocked, mock }` for the nav badge / Overview row |
| `POST /api/content-review/reset-mock` | Review session, mock mode only | Restore the example packages |
| `POST|DELETE /api/review-auth` | — | Passcode sign-in / sign-out (signed HTTP-only cookie) |

### Inbound package POST (n8n → dashboard)

- Keyed by `packageId` (legacy `contentId` accepted as an alias). `source: "sheet" | "n8n"` (default `n8n`); the card shows "Updated from sheet" when the last write came from the sheet. Sheet row reference is `sheetRef: { tab, row, sheetUrl }` (a legacy `source` *object* is still read as `sheetRef`).
- **Older revision → 409.** **Same revision → accepted** as a status / platform-status update: send only what changed (e.g. `{ packageId, revision, source: "sheet", platforms: [{ platform: "website", status: "approved" }] }`); rows merge by `platform`. **Newer revision or new item →** full package (`status`, `subject` required).
- Row `status`: `review | approved | not_approved | held_tone | held_title | awaiting_manual | posted_manual | published_private | killed | scheduled | posted | failed` (`posted_manual` rows may carry `postedAt` + `postedRevision`). Package `status`: `review | revising | approved | scheduled | posted | failed | killed | blocked`. Legacy `rejected` → `killed`, `skipped` → `not_approved`.
- A card stays in **Awaiting review** while any row is `review` (derived; package status alone isn't trusted). `held_tone` / `held_title` rows put it in **Held by the publisher** at the top; `awaiting_manual` rows put it in **To finish by hand**. `published_private` (YouTube private upload while the Google API audit is pending) is never shown as live.
- Optional: `toneCheckedRevision` (or `toneChecked: true` = this revision), `qaFlags: [{ check: duration|first_word|scene_length|loudness, detail }]`, `coverImageUrl`, `script.youtubeTitleOptions[]`, `script.hookOverlay`, `script.openQuestion`, `script.coverFrameScene`, youtube row `selectedTitle` (string|null; sheet is truth, null after approval = option 1 default).
- `sensitive` can't be cleared from here: an inbound `false` over a stored `true` is ignored and noted in history ("sensitive flag change ignored").
- `pendingAction` clears when the inbound state shows the action landed (approve: approved rows no longer `review`; reject: `revising` or newer revision; kill: `killed`; confirm_tone: `toneCheckedRevision` = revision or no `held_tone` rows; mark_manual_done: row no longer `awaiting_manual`), on any newer revision, or when n8n sends `clearPending: true`.

### Outbound action webhook (dashboard → n8n)

Single URL `N8N_REVIEW_WEBHOOK_URL` (e.g. `https://paranormaltours.duckdns.org/webhook/pt-content/review`), signed `X-PT-Signature: hex(HMAC-SHA256(N8N_WEBHOOK_SECRET, rawBody))`; `X-PT-Attempt` (unsigned) is `>1` on a founder Retry, which resends the identical body. Switch on `body.action`:

```json
{ "action": "approve", "packageId": "…", "revision": 2, "platforms": ["instagram","youtube"], "stages": [], "feedback": "", "toneChecked": true, "selectedTitle": "…", "actor": "founder", "at": "ISO" }
{ "action": "reject",  "packageId": "…", "revision": 2, "platforms": [], "stages": ["script"], "feedback": "…", "actor": "founder", "at": "ISO" }
{ "action": "kill",    "packageId": "…", "revision": 4, "platforms": [], "stages": [], "feedback": "", "actor": "founder", "at": "ISO" }
{ "action": "confirm_tone", "packageId": "…", "revision": 1, "toneChecked": true, "actor": "founder", "at": "ISO" }
{ "action": "mark_manual_done", "packageId": "…", "revision": 1, "platform": "tiktok", "actor": "founder", "at": "ISO" }
```

- `toneChecked` must be `true` to approve a SENSITIVE item (server-validated, per revision). `selectedTitle` is required when approving YouTube and `script.youtubeTitleOptions` exist, and must be one of them (no free text).
- **Mock mode** (no `N8N_REVIEW_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET`): EXAMPLE packages are seeded and actions apply instantly to the local cache (`approve` → chosen rows `approved`, other open rows `not_approved`; `reject` → `revising`, revision +1; `kill` → `killed`; `confirm_tone` → `held_tone` rows `approved`; `mark_manual_done` → row `posted_manual` with `postedAt`).
- **Real mode**: no optimistic flip. The card shows "Approving… / Sending back… / Killing… / Confirming tone… / Marking posted…" (stored as `pendingAction { action, at, payload }`) until n8n posts the new state back. After 10 minutes it turns amber ("No response from n8n yet") with **Retry**. Example data is hidden unless `CONTENT_REVIEW_MOCK_SEED=1`.
- **Storage**: Upstash Redis hash `pt:content-review:v2:packages` in production, `pt:content-review:<VERCEL_ENV>:v2:packages` elsewhere (preview/local never write production review data). Falls back to memory without Redis.
- **Passcode**: set `REVIEW_ADMIN_PASSWORD` (and optionally `REVIEW_SESSION_SECRET`) to gate `/review` and the review APIs via `src/middleware.ts`. Without it the page shows an "Unprotected" banner.
