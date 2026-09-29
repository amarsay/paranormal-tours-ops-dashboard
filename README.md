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

### Parked blockers

Each agent card holds one live task, so an old blocker used to hide new work
(e.g. Sid blocked on a Tailscale SSH job while actually working on a VPS
backup). Agents can now **park** a blocker and keep heartbeating their real
status/task. Parked blockers are independent of `status` / `taskTitle`:
posting `status: "working"` never clears them.

**GET** — every row carries `parkedBlockers` (oldest first; `[]` when none,
including rows written before this feature):

```json
"sid": {
  "agentId": "sid",
  "status": "working",
  "taskTitle": "VPS backup",
  "…": "…",
  "parkedBlockers": [
    { "id": "tailscale-ssh", "title": "Tailscale SSH",
      "reason": "Needs the ACL change approved", "since": "2026-09-27T05:00:00.000Z" }
  ]
}
```

**POST** (same endpoint + Bearer token as the heartbeat) — optional fields:

| Field | Effect |
|-------|--------|
| `parkBlocker: { id, title, reason, since? }` | Upsert by `id`. Server sets `since` (ISO 8601 UTC) when absent; an update keeps the original `since`. |
| `clearBlocker: "<id>"` | Remove. Unknown id → no-op `200`. |
| `parkedBlockers: […]` | **Ignored** — the server owns the list. |

- Neither field → the list is untouched (existing reporters behave exactly as before).
- Validation: `id` `^[a-z0-9-]{1,64}$`; `title` 1–120 chars; `reason` ≤280
  (may be empty); `since` ISO 8601 with a zone (stored as UTC); max **10**
  per agent (11th → `409`). One blocker op per POST (both → `400`).
- Malformed → `400` and the **whole** POST is rejected, heartbeat fields
  included — nothing is half-applied. Unknown agent → `404`.
- A POST with only identity (`agentId` / `agentName`) + a blocker op leaves
  the live status/task row alone; add heartbeat fields to update both at once.
- Response: `{ ok, row, parkedBlockers, blocker: { op, … }, snapshot }`.

```bash
# park (upsert)
curl -sS -X POST https://<deployment>/api/agent-ops/status \
  -H "Authorization: Bearer <OPS_WRITE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "sid",
    "status": "working",
    "taskTitle": "VPS backup",
    "taskState": "in_progress",
    "parkBlocker": {
      "id": "tailscale-ssh",
      "title": "Tailscale SSH",
      "reason": "Needs the ACL change approved before SSH can be enabled"
    }
  }'

# clear
curl -sS -X POST https://<deployment>/api/agent-ops/status \
  -H "Authorization: Bearer <OPS_WRITE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "agentId": "sid", "clearBlocker": "tailscale-ssh" }'
```

**Storage / concurrency.** Blockers are *not* kept in the shared status JSON
blob (which every heartbeat read-modify-writes). Each agent has its own Redis
hash `pt:agent-ops:parked:v1:<agentId>` keyed by blocker id. Park is a single
Lua `EVAL` (atomic in Redis: keep existing `since`, enforce the cap, `HSET`);
clear is `HDEL`; GET pipelines one `HGETALL` per row. So concurrent parks can't
exceed the cap or lose `since`, and heartbeats can't clobber blockers. In
memory mode every op is synchronous in one process. A store error on a
blocker op returns `503` with nothing applied.

**UI.** Cards show an amber “N parked blocker(s)” chip that discloses the list
(title, reason, “waiting 2d 3h”); **Needs you** has a separate *Parked
blockers* section (all agents, oldest first); the agent page lists them.
Waiting time is measured against the live-sync snapshot clock, like
staleness. The mock stream (in-memory store only) adds example data: Sid
working on “VPS backup” with “Tailscale SSH” parked, and Polly with two.

Agent cadence (Spectre): immediate on change; every **15s** while working/blocked/review; every **60s** while idle.

Dashboard polls GET every **5s**. Live JSON **wins** over localStorage for status / task title / heartbeat fields.

### Freshness (client)

- Live dot: heartbeat ≤30s (active) / ≤2m (idle)
- Stale: miss >90s (active) / >5m (idle)
- `done` pulses ~60s then idle; `failed` stays until new task
- `offline`: never checked in via live
- Ages are measured against the **snapshot** (server `Date` header of the poll
  response, falling back to fetch-completed time), not the browser's render
  clock — so a throttled background tab can't push agents past 90s/5m between
  polls. “Updated Xs ago” may tick forward up to 10s between polls (display only).

### Live sync indicator (header)

- One failed poll keeps the last good snapshot and shows **Reconnecting…**;
  the board shows **Offline** only after **3 consecutive** failed polls (a poll
  that hangs >8s counts as failed). Any success resets the counter.
- Returning to the tab (`visibilitychange` → visible) refetches immediately;
  stale/offline marking is suppressed until that refetch resolves.
- “Last synced Ns ago” shows how long since the last successful poll.
- After ~2 min truly offline (3+ failed polls; measured from the last
  successful sync, `OFFLINE_DIM_AFTER_MS` in `src/lib/live-sync.ts`) agent
  cards dim (visual only — chips/statuses unchanged) and a banner shows
  “Showing data from HH:MM (UK)”. While offline, card times read
  “Updated at HH:MM” instead of “Xs ago”. Cleared on the next successful poll.
- Phones: a compact coloured status pill sits in the header, plus a thin
  Reconnecting/Offline banner with “Last synced …”; the nav wraps to its own
  row so all tabs fit at 360px.

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
