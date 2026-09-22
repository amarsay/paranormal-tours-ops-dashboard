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
