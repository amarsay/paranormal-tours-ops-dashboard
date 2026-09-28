"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label,
  onCopied,
}: {
  text: string;
  label: string;
  onCopied?: (ok: boolean) => void;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Fallback for browsers without async clipboard permission
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    setDone(ok);
    onCopied?.(ok);
    if (ok) setTimeout(() => setDone(false), 1500);
  }

  return (
    <button type="button" onClick={copy} className="btn-ghost text-xs" aria-label={`Copy ${label}`}>
      {done ? "Copied ✓" : `Copy ${label}`}
    </button>
  );
}
