// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { demoDataAllowed, initialData, showNoLiveData } from "../src/lib/demo-policy";
import type { RosterSeed } from "../src/types";

const ROOT = path.resolve(__dirname, "..");
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, "public/roster.json"), "utf8")) as RosterSeed;

test("demo flag: only 'off' disables demo data", () => {
  assert.equal(demoDataAllowed("off"), false);
  assert.equal(demoDataAllowed("on"), true);
  assert.equal(demoDataAllowed(undefined), true);
});

test("production initial data: neutral roster, no demo tasks or activity", () => {
  const d = initialData(roster, false);
  assert.equal(d.agents.length, roster.agents.length);
  for (const a of d.agents) {
    assert.equal(a.status, "idle");
    assert.equal(a.currentTask, null);
    assert.equal(a.lastUpdate, null);
  }
  assert.deepEqual(d.tasks, []);
  assert.deepEqual(d.activity, []);
});

test("dev/preview initial data keeps the demo board", () => {
  const d = initialData(roster, true);
  assert.ok(d.tasks.length > 0);
  assert.ok(d.agents.some((a) => a.status !== "idle" || a.currentTask));
});

test("gate: production without a live snapshot shows the empty state", () => {
  assert.equal(showNoLiveData(false, false), true);
  assert.equal(showNoLiveData(false, true), false);
  assert.equal(showNoLiveData(true, false), false);
});

test("next.config sets NEXT_PUBLIC_PT_DEMO_DATA from VERCEL_ENV", async () => {
  const url = pathToFileURL(path.join(ROOT, "next.config.mjs")).href;
  const load = async (v?: string) => {
    const saved = process.env.VERCEL_ENV;
    if (v) process.env.VERCEL_ENV = v;
    else delete process.env.VERCEL_ENV;
    try {
      return (await import(`${url}?env=${v}`)).default.env.NEXT_PUBLIC_PT_DEMO_DATA;
    } finally {
      if (saved) process.env.VERCEL_ENV = saved;
      else delete process.env.VERCEL_ENV;
    }
  };
  assert.equal(await load("production"), "off");
  assert.equal(await load("preview"), "on");
  assert.equal(await load(undefined), "on");
});
