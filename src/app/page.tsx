import { AttentionStrip } from "@/components/AttentionStrip";
import { KpiStrip } from "@/components/KpiStrip";
import { OverviewAgents } from "@/components/OverviewAgents";
import { ResetDemoButton } from "@/components/ResetDemoButton";

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
            Live presence from Spectre heartbeats. Unblock and review work that
            needs you — status refreshes every few seconds.
          </p>
        </div>
        <ResetDemoButton />
      </div>

      <KpiStrip />
      <AttentionStrip />
      <OverviewAgents />
    </div>
  );
}
