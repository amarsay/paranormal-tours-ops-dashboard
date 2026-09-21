import { ActivityFeed } from "@/components/ActivityFeed";
import { KpiStrip } from "@/components/KpiStrip";
import { ResetDemoButton } from "@/components/ResetDemoButton";
import { SquadCards } from "@/components/SquadCards";

export default function OverviewPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-violet-300/80">
            Founder centre
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-50">
            Agent operations overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-300">
            Track specialist teammates across Growth, Platform, Ops and Content.
            Assign work, organise the board, and keep Codex Ignota moving —
            all persisted locally for demos.
          </p>
        </div>
        <ResetDemoButton />
      </div>

      <KpiStrip />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-400">
            Squads
          </h2>
          <SquadCards />
        </div>
        <div className="lg:col-span-2">
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
