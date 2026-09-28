import type { ContentPackage } from "@/lib/content-review-types";
import { formatGbp, formatLondon } from "@/lib/content-review-rules";
import { ExampleTag } from "./ContentStatusChip";

const REASONS: Record<string, string> = {
  thin_source: "Thin source — the row has no paranormal history, so no script was written (slot skipped).",
  banned_phrase: "Banned phrase still present after the free auto-fix.",
};

export function BlockedList({ items }: { items: ContentPackage[] }) {
  return (
    <section aria-labelledby="blocked-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="blocked-heading" className="text-sm font-semibold uppercase tracking-wider text-rose-300/90">
          Blocked
        </h2>
        <p className="text-xs text-ink-500">Read-only · {items.length} item(s)</p>
      </div>
      {items.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-ink-400">Nothing blocked.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li key={p.packageId} className="card border-rose-500/15 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-ink-100">{p.subject}</p>
                {p.example && <ExampleTag />}
              </div>
              <p className="mt-1 text-sm text-rose-200/90">
                <span className="font-mono text-xs text-rose-300">{p.blockedReason ?? "unknown"}</span>{" "}
                — {REASONS[p.blockedReason ?? ""] ?? "Blocked by the pipeline."}
              </p>
              <p className="mt-1 text-xs text-ink-500">
                {p.sheetRef.tab} · row {p.sheetRef.row} · cost {formatGbp(p.costActualGbp)} · {formatLondon(p.updatedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
