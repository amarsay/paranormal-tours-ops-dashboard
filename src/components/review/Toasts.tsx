"use client";

export type Toast = { id: number; tone: "ok" | "error" | "info"; message: string };

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl px-4 py-2.5 text-sm shadow-lg ring-1 backdrop-blur ${
            t.tone === "error"
              ? "bg-rose-950/90 text-rose-100 ring-rose-400/40"
              : t.tone === "ok"
                ? "bg-teal-950/90 text-teal-100 ring-teal-400/40"
                : "bg-ink-900/95 text-ink-100 ring-white/10"
          }`}
          role={t.tone === "error" ? "alert" : undefined}
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            className="text-xs opacity-70 hover:opacity-100"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
