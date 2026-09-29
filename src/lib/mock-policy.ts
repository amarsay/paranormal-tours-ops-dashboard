import { storageMode } from "./live-store";

/**
 * Whether (and how) the mock may write:
 *  - "disabled": production — VERCEL_ENV=production (always), or
 *    NODE_ENV=production outside Vercel (e.g. `next start`) unless
 *    PT_MOCK_WRITES=1. GET is read-only; POST → 403 mock_disabled.
 *  - "token": a real shared store (Upstash) outside production, e.g. Vercel
 *    preview, which shares production KV today. Writes need the Bearer
 *    OPS_WRITE_TOKEN (GET with the header, or POST); unauthenticated GET is
 *    read-only.
 *  - "open": in-memory store (next dev / local) — GET ticks as before.
 */
export function mockWritePolicy(
  env: NodeJS.ProcessEnv = process.env
): "disabled" | "token" | "open" {
  if (env.VERCEL_ENV === "production") return "disabled";
  if (
    env.NODE_ENV === "production" &&
    !env.VERCEL_ENV &&
    env.PT_MOCK_WRITES !== "1"
  ) {
    return "disabled";
  }
  return storageMode() === "memory" ? "open" : "token";
}
