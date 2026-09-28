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
| `POST /api/content-review/{packageId}/action` | Review session | `approve` / `reject` / `kill` / `confirm_tone` / `mark_manual_done` / `mark_stale` / `pick_title`, or `{ retry: true, revision }` |
| `GET /api/content-review/summary` | Public (counts only) | `{ pending, held, manual, blocked, mock }` for the nav badge / Overview row |
| `POST /api/content-review/reset-mock` | Review session, mock mode only | Restore the example packages |
| `POST|DELETE /api/review-auth` | — | Passcode sign-in / sign-out (signed HTTP-only cookie) |

Full contract (both directions, signing, indexing): **section 3 of `content-pipeline/BILLY-content-review-v0.1.md`**. Summary:

### Inbound package POST (n8n → dashboard)

- Keyed by `packageId` (legacy `contentId` accepted). `source: "sheet" | "n8n"` (default `n8n`); "Updated from sheet" shows on the card. Row reference is `sheetRef: { tab, row, sheetUrl }`.
- **Older revision → 409. Same revision → accepted** as a partial status / platform-status merge (rows merge by `platform`). Newer or new → full package.
- Row `status`: `review | approved | not_approved | held_tone | held_title | held_release | awaiting_manual | posted_manual | published_private | out_of_date | killed | scheduled | posted | failed`. `held_release` needs `holdReason: codex_status | banned_phrase | tone`. `posted_manual` may carry `postedAt` + `postedRevision`.
- Groups derive from rows: **Held by the publisher** (held_*), **Awaiting review** (any `review`), **To finish by hand** (`awaiting_manual`).
- `contentType: daily_ai | promo` (default daily_ai) and `sensitive` are pipeline-owned: inbound changes are ignored and noted in history.
- Optional: `toneCheckedRevision` / `toneChecked`, `qaFlags[{check,detail}]`, `coverImageUrl`, `codexUrl`, `voiceProvider`, `visualProvider` (unknown values → "Unknown provider" chip), `script.youtubeTitleOptions[]` / `hookOverlay` / `openQuestion` / `coverFrameScene` (1-based integer), youtube row `selectedTitle`.
- `error: { code, message }` shows the message inline (code kept in history; `null` clears). `clearPending: true` clears a pending action.

### Outbound action webhook (dashboard → n8n)

Single `N8N_REVIEW_WEBHOOK_URL`; `body.action` = `approve | reject | kill | confirm_tone | mark_manual_done | mark_stale | pick_title` (`titleIndex` is 0-based).
Headers: `X-PT-Timestamp: <unix seconds>` (fresh each attempt), `X-PT-Signature: <bare lowercase hex>` = HMAC-SHA256(`N8N_WEBHOOK_SECRET`, `${timestamp}.${rawBody}`), `X-PT-Attempt` (unsigned). Retry resends the identical raw body (same `at`) with a new timestamp and signature.

- **Mock mode** (no `N8N_REVIEW_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET`): EXAMPLE packages are seeded and actions apply instantly to the local cache (`approve` → chosen rows `approved`, other open rows `not_approved`; `reject` → `revising`, revision +1; `kill` → `killed`; `confirm_tone` → `held_tone` rows `approved`; `mark_manual_done` → row `posted_manual` with `postedAt`; `mark_stale` → `out_of_date`; `pick_title` → youtube `approved` with that title).
- **Real mode**: no optimistic flip. The card shows "Approving… / Sending back… / Killing… / Confirming tone… / Marking posted… / Marking out of date… / Using title…" (stored as `pendingAction { action, at, payload }`) until n8n posts the new state back. After 10 minutes it turns amber ("No response from n8n yet") with **Retry**. Example data is hidden unless `CONTENT_REVIEW_MOCK_SEED=1`.
- **Storage**: Upstash Redis hash `pt:content-review:v2:packages` in production, `pt:content-review:<VERCEL_ENV>:v2:packages` elsewhere (preview/local never write production review data). Falls back to memory without Redis.
- **Passcode**: set `REVIEW_ADMIN_PASSWORD` (and optionally `REVIEW_SESSION_SECRET`) to gate `/review` and the review APIs via `src/middleware.ts`. Without it the page shows an "Unprotected" banner.
