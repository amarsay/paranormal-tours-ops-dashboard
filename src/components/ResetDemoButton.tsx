"use client";

import { useOps } from "@/lib/store";

export function ResetDemoButton() {
  const { resetDemo } = useOps();
  return (
    <button type="button" onClick={resetDemo} className="btn-ghost text-xs">
      Reset demo data
    </button>
  );
}
