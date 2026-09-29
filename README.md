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
- Validation (all checked before anything is written):
  - `id` `^[a-z0-9-]{1,64}$`.
  - `title` 1–120 and `reason` 0–280 **Unicode code points** after trimming
    leading/trailing whitespace (stored trimmed). `"👻".repeat(120)` passes; a
    ZWJ emoji such as 👨‍👩‍👧 counts as its 5 code points.
  - `since` strict ISO 8601 **UTC** — `YYYY-MM-DDTHH:MM[:SS[.fff…]]Z` — naming a
    real calendar date/time (`2026-02-30`, `24:00`, `:60`, offsets such as
    `+01:00` are rejected, not rolled over) and not more than **2 minutes** in the
    future (clock skew).
  - One blocker action per POST (both → `400`).
- Errors carry `{ error, code }`:

  | HTTP | `code` | When |
  |------|--------|------|
  | 400 | `invalid_blocker` | bad id / title / reason / shape, or both actions |
  | 400 | `invalid_since` | `since` not strict ISO 8601 UTC or not a real date |
  | 400 | `since_in_future` | `since` > server time + 2 min |
  | 409 | `blocker_limit` | 11th blocker for the agent |
  | 409 | `no_live_row` | park for an agent that has never heartbeated, with no heartbeat fields in the POST (would be invisible) |
  | 503 | `store_unavailable` | Redis error |

  On any error the **whole** POST is rejected, heartbeat fields included.
  Unknown agent → `404`.
- **Partial update:** a POST that carries a blocker action merges only the
  heartbeat fields it actually sends onto the stored row (plus
  `heartbeatAt`/`updatedAt`, defaulting to server time). A blocker-only POST
  (`agentId` + `parkBlocker`/`clearBlocker`) leaves the row untouched. If the
  agent has no row yet and the POST has heartbeat fields, a row is created
  from them.
- **Plain heartbeats** (no blocker action) keep the long-standing **full-row**
  semantics: omitted fields reset to defaults (`idle` / `null`). Kept on
  purpose so a reporter that drops `blockerReason` / `taskTitle` still clears
  them, and existing reporters behave identically.
- `clearBlocker` works even for an agent with no row (cleans up stray hashes).
- Response: `{ ok, row, parkedBlockers, blocker: { op, … }, snapshot }`; a
  plain heartbeat's `row` also includes `parkedBlockers`.

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

**Storage / concurrency.** The data layout is unchanged from production:
rows stay in the JSON string `pt:agent-ops:status:v1`; parked blockers live in
a per-agent Redis hash `pt:agent-ops:parked:v1:<agentId>` keyed by blocker id.
Every write — plain heartbeat or blocker POST — is **one Lua `EVAL`**
(`src/lib/status-lua.ts`), which Redis runs atomically: it decodes the JSON,
updates only that agent's row (replace or merge), applies the park/clear
(keeping an existing `since`, enforcing the cap, checking the row exists) and
re-encodes. There's no GET-then-SET window any more, so concurrent heartbeats
for different agents can't drop each other's rows (previously the last `SET`
won), and a blocker action and its heartbeat fields commit together or not at
all. No migration: old code can still read (and write) the key, so rollback
is safe. GET pipelines one `HGETALL` per row. In memory mode every op is
synchronous in one process.

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
