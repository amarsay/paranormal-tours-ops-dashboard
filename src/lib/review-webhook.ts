import { createHmac } from "node:crypto";
import type { ReviewActionPayload } from "./content-review-types";

/**
 * Server-side only. Forwards a founder action to n8n.
 *
 * Signing (agreed with Spectre):
 *   X-PT-Timestamp: <unix seconds>            fresh on every attempt
 *   X-PT-Signature: <lowercase hex>           bare hex, no "sha256=" prefix
 *   signature = HMAC-SHA256(N8N_WEBHOOK_SECRET, `${timestamp}.${rawBody}`)
 * rawBody is the exact string sent (never re-serialised). A Retry resends the
 * identical rawBody (same `at` = original click) with a new timestamp and
 * signature; n8n rejects timestamps older than 5 minutes.
 * N8N_WEBHOOK_SECRET never reaches the browser.
 *
 * Single webhook (N8N_REVIEW_WEBHOOK_URL, e.g.
 * https://paranormaltours.duckdns.org/webhook/pt-content/review); n8n
 * switches on body.action.
 */
export type ForwardResult =
  | { ok: true; status: number; body: unknown; rawBody: string }
  | { ok: false; status: number; error: string };

export function signBody(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export async function forwardToN8n(
  payload: ReviewActionPayload,
  opts: { attempt?: number; rawBody?: string } = {}
): Promise<ForwardResult> {
  const url = process.env.N8N_REVIEW_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!url || !secret) {
    return { ok: false, status: 503, error: "n8n webhook is not configured." };
  }
  // Serialise once; retries pass the stored string back in unchanged.
  const body = opts.rawBody ?? JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PT-Timestamp": timestamp,
        "X-PT-Signature": signBody(secret, timestamp, body),
        // Informational only (not signed): >1 means a founder Retry of the same body.
        "X-PT-Attempt": String(opts.attempt ?? 1),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text().catch(() => "");
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // n8n may answer with plain text
    }
    if (!res.ok) {
      return {
        ok: false,
        status: 502,
        error: `n8n answered ${res.status}. The action was not recorded; try again.`,
      };
    }
    return { ok: true, status: res.status, body: parsed, rawBody: body };
  } catch (err) {
    const timeout = err instanceof Error && err.name === "TimeoutError";
    console.error("[content-review] n8n forward failed", timeout ? "timeout" : err);
    return {
      ok: false,
      status: 502,
      error: timeout
        ? "n8n did not answer within 10 seconds. The action was not recorded; try again."
        : "Could not reach n8n. The action was not recorded; try again.",
    };
  }
}
