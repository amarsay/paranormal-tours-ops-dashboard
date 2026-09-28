import { createHmac } from "node:crypto";
import type { ReviewActionPayload } from "./content-review-types";

/**
 * Server-side only. Forwards a founder action to n8n, signed with
 * HMAC-SHA256 (hex) of the exact JSON body in X-PT-Signature.
 * N8N_WEBHOOK_SECRET never reaches the browser.
 *
 * Single webhook (N8N_REVIEW_WEBHOOK_URL, e.g.
 * https://paranormaltours.duckdns.org/webhook/pt-content/review); n8n
 * switches on body.action = approve | reject | kill | confirm_tone.
 */
export type ForwardResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; error: string };

export function signBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export async function forwardToN8n(
  payload: ReviewActionPayload,
  opts: { attempt?: number } = {}
): Promise<ForwardResult> {
  const url = process.env.N8N_REVIEW_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!url || !secret) {
    return { ok: false, status: 503, error: "n8n webhook is not configured." };
  }
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PT-Signature": signBody(secret, body),
        // Informational only (not signed): >1 means a founder Retry of the same payload.
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
    return { ok: true, status: res.status, body: parsed };
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
