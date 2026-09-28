/**
 * Founder passcode session for /review (Billy spec section 6, option 1).
 * Web Crypto only, so it runs in both Edge middleware and Node routes.
 * The cookie holds `<expiryMs>.<hmacHex>`; it never contains the password.
 */

export const REVIEW_COOKIE = "pt_review_session";
export const REVIEW_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

export function reviewPasswordConfigured(): boolean {
  return Boolean(process.env.REVIEW_ADMIN_PASSWORD);
}

function sessionSecret(): string | null {
  return process.env.REVIEW_SESSION_SECRET || process.env.REVIEW_ADMIN_PASSWORD || null;
}

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison for equal-length strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionValue(): Promise<string | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const exp = Date.now() + REVIEW_SESSION_MAX_AGE_SEC * 1000;
  return `${exp}.${await hmacHex(secret, `pt-review-session:${exp}`)}`;
}

export async function verifySessionValue(value: string | undefined | null): Promise<boolean> {
  const secret = sessionSecret();
  if (!secret || !value) return false;
  const [expRaw, sig] = value.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || !sig || exp < Date.now()) return false;
  const expected = await hmacHex(secret, `pt-review-session:${exp}`);
  return safeEqual(sig, expected);
}

/** Compare a submitted passcode with REVIEW_ADMIN_PASSWORD without leaking timing. */
export async function passwordMatches(submitted: string): Promise<boolean> {
  const expected = process.env.REVIEW_ADMIN_PASSWORD;
  if (!expected || !submitted) return false;
  const k = "pt-review-password-check";
  const [a, b] = await Promise.all([hmacHex(k, submitted), hmacHex(k, expected)]);
  return safeEqual(a, b);
}

/** Bearer OPS_WRITE_TOKEN check usable from Edge middleware. */
export function bearerMatchesWriteToken(authHeader: string | null): boolean {
  const expected = process.env.OPS_WRITE_TOKEN;
  if (!expected || !authHeader) return false;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return Boolean(m && safeEqual(m[1], expected));
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** For Node route handlers: is this request allowed to act on /review? */
export async function requestHasReviewAccess(req: Request): Promise<boolean> {
  if (!reviewPasswordConfigured()) return true;
  return verifySessionValue(readCookie(req.headers.get("cookie"), REVIEW_COOKIE));
}
