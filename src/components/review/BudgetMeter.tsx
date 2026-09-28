import type { BudgetSummary } from "@/lib/content-review-types";
import { formatGbp } from "@/lib/content-review-rules";

/** Month-to-date spend vs £35 budget, with Spectre's £33 hard stop marked. */
export function BudgetMeter({ budget }: { budget: BudgetSummary }) {
  const { monthToDateGbp: mtd, budgetGbp, hardStopGbp } = budget;
  const pct = Math.min(100, Math.max(0, (mtd / budgetGbp) * 100));
  const stopPct = (hardStopGbp / budgetGbp) * 100;
  const warnFrom = hardStopGbp - 5; // amber in the last £5 before the stop

  let tone = "from-teal-500/80 to-violet-500/80";
  let label = "On track";
  let labelClass = "text-teal-200";
  if (mtd >= hardStopGbp) {
    tone = "from-rose-600 to-rose-400";
    label = "Hard stop reached — generation paused";
    labelClass = "text-rose-200";
  } else if (mtd >= warnFrom) {
    tone = "from-amber-500 to-amber-300";
    label = "Close to the hard stop";
    labelClass = "text-amber-200";
  }

  const remainingToStop = Math.max(0, hardStopGbp - mtd);

  return (
    <section className="card px-4 py-4 sm:px-5" aria-labelledby="budget-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="budget-heading" className="text-sm font-semibold uppercase tracking-wider text-ink-300">
          Content budget · this month
          {budget.example && (
            <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-400/40">
              EXAMPLE
            </span>
          )}
        </h2>
        <p className={`text-xs font-medium ${labelClass}`}>{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink-50">
        {formatGbp(mtd)}{" "}
        <span className="text-sm font-normal text-ink-400">of {formatGbp(budgetGbp)}</span>
      </p>
      <div
        className="relative mt-3 h-3 w-full overflow-visible rounded-full bg-white/5 ring-1 ring-white/10"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={budgetGbp}
        aria-valuenow={Number(mtd.toFixed(2))}
        aria-valuetext={`${formatGbp(mtd)} spent of ${formatGbp(budgetGbp)}; hard stop at ${formatGbp(hardStopGbp)}`}
        aria-label="Month-to-date content spend"
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute -top-1 h-5 w-0.5 rounded bg-rose-300"
          style={{ left: `calc(${stopPct}% - 1px)` }}
          aria-hidden
        />
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-ink-500">
        <span className="absolute left-0">£0</span>
        <span
          className="absolute -translate-x-full pr-1 text-rose-200/80"
          style={{ left: `${stopPct}%` }}
        >
          Hard stop {formatGbp(hardStopGbp)}
        </span>
        <span className="absolute right-0">{formatGbp(budgetGbp)}</span>
      </div>
      <p className="mt-2 text-xs text-ink-400">
        {formatGbp(remainingToStop)} left before the hard stop. Revisions add to this total.
      </p>
    </section>
  );
}
