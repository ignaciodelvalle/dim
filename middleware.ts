// Next.js middleware runs on every request that matches the `matcher` below.
// Its only job here is to call updateSession() so Supabase auth cookies stay
// fresh, and to redirect legacy /refugio/* paths to /org so old bookmarks
// and external links continue to work.

import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permanent redirect: legacy /refugio/* → /org (the org picker).
  // We send the user to /org rather than attempting to reconstruct an
  // org-scoped URL because we don't have the orgToken in the old paths.
  if (pathname === "/refugio" || pathname.startsWith("/refugio/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/org";
    return NextResponse.redirect(url, { status: 308 });
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on every request except static files, image optimization, the
    // favicon, and any file with a recognizable extension (svg, png, jpg, ...).
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
