import { readFileSync } from "fs";
import path from "path";
import type { RosterSeed } from "@/types";

export function loadRoster(): RosterSeed {
  const file = path.join(process.cwd(), "public", "roster.json");
  const raw = readFileSync(file, "utf8");
  return JSON.parse(raw) as RosterSeed;
}
