import { Suspense } from "react";
import { AgentsGrid } from "@/components/AgentsGrid";

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-50">
          Agents
        </h1>
        <p className="mt-2 text-sm text-ink-300">
          Search and filter all 31 Paranormal Tours specialists by squad or
          status.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="card p-6 text-sm text-ink-400">Loading agents…</div>
        }
      >
        <AgentsGrid />
      </Suspense>
    </div>
  );
}
