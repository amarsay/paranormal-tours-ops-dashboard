/**
 * Visual-only dimming for agent cards when the board has been truly offline
 * for OFFLINE_DIM_AFTER_MS. Never changes statuses/chips. The fade is skipped
 * for users who prefer reduced motion.
 */
export function offlineDimClass(dimmed: boolean): string {
  return `transition-[opacity,filter] duration-500 motion-reduce:transition-none ${
    dimmed ? "opacity-50 saturate-[.35]" : ""
  }`;
}
