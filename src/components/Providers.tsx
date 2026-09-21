"use client";

import { OpsProvider } from "@/lib/store";
import type { RosterSeed } from "@/types";

export function Providers({
  children,
  roster,
}: {
  children: React.ReactNode;
  roster: RosterSeed;
}) {
  return <OpsProvider roster={roster}>{children}</OpsProvider>;
}
