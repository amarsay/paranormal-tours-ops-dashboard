import { NextResponse } from "next/server";
import {
  REVIEW_COOKIE,
  REVIEW_SESSION_MAX_AGE_SEC,
  createSessionValue,
  passwordMatches,
  reviewPasswordConfigured,
} from "@/lib/review-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST { password } — sets the signed HTTP-only review session cookie. */
export async function POST(req: Request) {
  if (!reviewPasswordConfigured()) {
    return NextResponse.json({ ok: true, unprotected: true });
  }
  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!(await passwordMatches(password))) {
    // Small fixed delay to slow guessing; never echo or log the attempt.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "That passcode is not right." }, { status: 401 });
  }

  const value = await createSessionValue();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(REVIEW_COOKIE, value ?? "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: REVIEW_SESSION_MAX_AGE_SEC,
  });
  return res;
}

/** DELETE — sign out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(REVIEW_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
