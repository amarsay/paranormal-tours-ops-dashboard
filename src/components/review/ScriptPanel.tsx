import type { ContentScript } from "@/lib/content-review-types";

export function ScriptPanel({ script }: { script: ContentScript }) {
  return (
    <details className="group rounded-xl border border-white/5 bg-ink-950/40">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium text-ink-200 hover:text-ink-50">
        <span>Script</span>
        <span className="text-xs text-ink-500 group-open:hidden">
          Show hook, narration and {script.scenes.length} scene(s)
        </span>
        <span className="hidden text-xs text-ink-500 group-open:inline">Hide</span>
      </summary>
      <div className="space-y-3 border-t border-white/5 px-3 py-3 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Hook</p>
          <p className="mt-0.5 text-ink-50">{script.hook || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Narration</p>
          <p className="mt-0.5 whitespace-pre-wrap text-ink-200">{script.narration || "—"}</p>
        </div>
        {script.scenes.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Scenes</p>
            <ol className="mt-1 space-y-1">
              {script.scenes.map((s, i) => (
                <li key={i} className="flex gap-2 text-ink-300">
                  <span className="w-6 shrink-0 text-right font-mono text-xs text-ink-500">{s.index ?? i + 1}.</span>
                  <span>
                    {s.text}
                    {s.visual && <span className="text-ink-500"> — {s.visual}</span>}
                    {typeof s.durationSec === "number" && (
                      <span className="text-ink-500"> ({s.durationSec}s)</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </details>
  );
}
