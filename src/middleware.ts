import { NextResponse, type NextRequest } from "next/server";
import {
  REVIEW_COOKIE,
  bearerMatchesWriteToken,
  verifySessionValue,
} from "@/lib/review-session";

/**
 * Passcode gate for Content Review (only runs on the paths in `matcher`,
 * so /api/agent-ops/* and the rest of the dashboard are untouched).
 * No-op when REVIEW_ADMIN_PASSWORD is unset (UI shows an "Unprotected" banner).
 */
export async function middleware(req: NextRequest) {
  if (!process.env.REVIEW_ADMIN_PASSWORD) return NextResponse.next();

  const { pathname, search } = req.nextUrl;

  // Public: the login page and the count-only summary used by the nav badge.
  if (pathname === "/review/login" || pathname === "/api/content-review/summary") {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");

  // n8n (server-to-server) may list/upsert with the existing write token.
  if (pathname === "/api/content-review" && bearerMatchesWriteToken(req.headers.get("authorization"))) {
    return NextResponse.next();
  }

  const ok = await verifySessionValue(req.cookies.get(REVIEW_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (isApi) {
    return NextResponse.json(
      { error: "Review session required. Sign in at /review/login." },
      { status: 401 }
    );
  }
  const login = req.nextUrl.clone();
  login.pathname = "/review/login";
  login.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/review", "/review/:path*", "/api/content-review", "/api/content-review/:path*"],
};
