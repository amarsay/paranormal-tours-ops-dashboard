"use client";

import { useEffect, useState } from "react";
import type { ContentReviewSummary } from "./content-review-types";

/**
 * Shared poller for the count-only /api/content-review/summary endpoint.
 * One fetch loop no matter how many components subscribe (nav badge,
 * Overview strip, /review page).
 */

const POLL_MS = 30_000;

let current: ContentReviewSummary | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(s: ContentReviewSummary | null) => void>();

async function load() {
  try {
    const res = await fetch("/api/content-review/summary", { cache: "no-store" });
    if (!res.ok) return;
    current = (await res.json()) as ContentReviewSummary;
    listeners.forEach((l) => l(current));
  } catch {
    // offline: keep the last known count
  }
}

export function refreshReviewSummary() {
  void load();
}

export function useReviewSummary(): ContentReviewSummary | null {
  const [summary, setSummary] = useState<ContentReviewSummary | null>(current);

  useEffect(() => {
    listeners.add(setSummary);
    if (!timer) {
      void load();
      timer = setInterval(load, POLL_MS);
    }
    return () => {
      listeners.delete(setSummary);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  return summary;
}
