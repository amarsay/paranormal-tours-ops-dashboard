# Paranormal Tours — Agent Ops Dashboard

Local founder dashboard for Paranormal Tours / Codex Ignota specialist agents.
Assign tasks, track status, organise the work board, and review a mock Codex
validation queue. All task and status changes persist in `localStorage`
(no backend required for v1).

## Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS

## Run locally

```bash
cd /workspace/pt-agent-ops-dashboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production build:

```bash
npm run build
npm start
```

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Overview — KPIs, squad cards, activity feed |
| `/agents` | Searchable / filterable grid of all 31 agents |
| `/agents/[slug]` | Agent detail, assign task, briefing notes |
| `/board` | Kanban: Backlog → In progress → Review → Done |
| `/codex` | Mock Codex Ignota validation queue |

## Data

- Seed roster: `public/roster.json` (copied from `pt-dashboard-roster.json`)
- Client state key: `pt-agent-ops-v1` in `localStorage`
- Use **Reset demo data** on the overview page to restore seed tasks

## Notes

- British English UI copy throughout.
- Live Grok Bot messaging is a future integration — the “Ask agent” form
  stores a local briefing note only.
- Optional `externalId` can be added to agents when Grok Bot IDs are available.
