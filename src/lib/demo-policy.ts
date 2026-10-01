import type { ActivityItem, Agent, RosterSeed, Task } from "@/types";
import { applySeedTaskStatuses, seedAgents, seedDemoTasks } from "./seed";

/**
 * Built-in demo data (roster seed statuses, demo board cards) is for local
 * dev and previews only. Production builds (VERCEL_ENV=production, inlined
 * via next.config.mjs) never show it: until a real snapshot has loaded the
 * dashboard shows a "No live data yet" state instead.
 */
export function demoDataAllowed(
  flag: string | undefined = process.env.NEXT_PUBLIC_PT_DEMO_DATA
): boolean {
  return flag !== "off";
}

export interface InitialData {
  agents: Agent[];
  tasks: Task[];
  activity: ActivityItem[];
}

/**
 * Starting agents/tasks/activity. With demo data: the seeded demo board.
 * Without: every roster agent neutral (idle, no task, no timestamps) and no
 * tasks — real values only ever come from a live snapshot.
 */
export function initialData(roster: RosterSeed, demo: boolean): InitialData {
  const base = seedAgents(roster);
  if (!demo) {
    return {
      agents: base.map((a) => ({
        ...a,
        status: "idle",
        currentTask: null,
        lastUpdate: null,
        notes: [],
      })),
      tasks: [],
      activity: [],
    };
  }
  const tasks = seedDemoTasks(base);
  const now = new Date().toISOString();
  return {
    agents: applySeedTaskStatuses(base, tasks),
    tasks,
    activity: [
      { id: "act-seed-1", message: "Dashboard seeded with 31 specialist agents.", at: now },
      { id: "act-seed-2", message: "Demo board cards loaded for Verity, Atlas, Sally and Billy.", at: now },
    ],
  };
}

/**
 * Production gate: show real views only once a snapshot with rows has
 * loaded in this tab (that data then stays, even if later polls fail).
 */
export function showNoLiveData(demo: boolean, liveDataLoaded: boolean): boolean {
  return !demo && !liveDataLoaded;
}
