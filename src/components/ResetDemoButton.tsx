"use client";

import { useOps } from "@/lib/store";

export function ResetDemoButton() {
  const { resetDemo, demoData } = useOps();
  if (!demoData) return null; // no demo data on production
  return (
    <button type="button" onClick={resetDemo} className="btn-ghost text-xs">
      Reset demo data
    </button>
  );
}
