// Next.js middleware runs on every request that matches the `matcher` below.
// Its only job here is to call updateSession() so Supabase auth cookies stay
// fresh, and to redirect legacy paths so old bookmarks and external links
// continue to work.

import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Expose the request pathname to server components via a request header.
  // Server layouts (e.g. app/(public)/layout.tsx) cannot read usePathname(),
  // so the unified AppShell decision (resolveShellNav, Item 7) needs the path
  // at the layout boundary to pick the citizen vs landing chrome by route.
  // This is additive and side-effect-free — it never alters routing.
  request.headers.set("x-pathname", pathname);

  // Permanent redirect: /pro/* → /cuenta/memberships.
  // The /pro portal has been removed; vets now operate through /org/[orgToken].
  // This catches browser bookmarks and external links for 30-day grace.
  if (pathname === "/pro" || pathname.startsWith("/pro/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/cuenta/memberships";
    return NextResponse.redirect(url, { status: 308 });
  }

  // Permanent redirect: legacy /refugio/* → /org (the org picker).
  // We send the user to /org rather than attempting to reconstruct an
  // org-scoped URL because we don't have the orgToken in the old paths.
  if (pathname === "/refugio" || pathname.startsWith("/refugio/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/org";
    return NextResponse.redirect(url, { status: 308 });
  }

  // Portal-follows-viewer (2026-07-02): the shared work surfaces (cola,
  // usuarios, organizaciones, reglas, servicios) exist under BOTH /admin and
  // /gob — same page implementation, chrome from each segment's layout. The
  // old AC3-era /admin→/gob 308s for these paths are GONE: /admin/* now
  // serves real pages. Only the renamed jurisdicciones subtree still remaps.
  //
  // Pages/components build their internal links from this header so a viewer
  // browsing under /admin never silently lands in /gob chrome (and vice
  // versa). Set on the request so server components can read it via headers().
  request.headers.set("x-portal-base", pathname.startsWith("/admin") ? "/admin" : "/gob");

  // Permanent redirect: /admin/jurisdicciones/* -> /admin/reglas/* (the
  // surface was renamed by admin-rules-console R1.6; the CRUD subtree dropped
  // the trailing "/reglas" segment when it folded into the unified surface).
  // Portal-follows-viewer keeps the admin bookmark inside the admin portal.
  const jurisdiccionesMatch = pathname.match(
    /^\/admin\/jurisdicciones(?:\/([^/]+)\/([^/]+)\/([^/]+)\/reglas((?:\/.*)?))?$/,
  );
  if (jurisdiccionesMatch) {
    const [, country, province, locality, rest] = jurisdiccionesMatch;
    const url = request.nextUrl.clone();
    url.pathname = country
      ? `/admin/reglas/${country}/${province}/${locality}${rest ?? ""}`
      : "/admin/reglas";
    return NextResponse.redirect(url, { status: 308 });
  }

  // Permanent redirects: legacy pet-profile lens routes (/vacunas, /historial,
  // /libreta) → the two-face profile with the matching `?tab=` query.
  //
  // These three page.tsx files already call permanentRedirect() themselves
  // (see app/(app)/mis-mascotas/[publicToken]/{vacunas,historial,libreta}/page.tsx),
  // but that page-level call does NOT reliably produce an HTTP 308 in
  // production: the shared boundary at
  // app/(app)/mis-mascotas/[publicToken]/loading.tsx makes Next.js stream a
  // 200 shell first and perform the redirect client-side via RSC flight
  // data — with JavaScript disabled/broken the request just hangs on
  // "Cargando…" forever. Live QA caught this (engram #635). Handling the
  // redirect here, at the edge, guarantees a real 308 before the request
  // ever reaches the page — the page-level permanentRedirect() calls stay in
  // place as belt-and-suspenders in case this matcher/regex ever misses.
  //
  // Must be an EXACT match on the three known lens segments: `/vacunas` has
  // a real sibling page at `/vacunas/programar` (schedule-a-vaccine form)
  // that must NOT be redirected.
  const legacyPetLensMatch = pathname.match(
    /^\/mis-mascotas\/([^/]+)\/(vacunas|historial|libreta)$/,
  );
  if (legacyPetLensMatch) {
    const [, publicToken, tab] = legacyPetLensMatch;
    const url = request.nextUrl.clone();
    url.pathname = `/mis-mascotas/${publicToken}`;
    url.search = `?tab=${tab}`;
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
