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

  // Permanent redirects: legacy /admin work-surface paths → /gob.
  // These paths moved in Slice 4 of the rebrand epic. Preserves query strings
  // (e.g. ?q= on search pages) and path suffixes (e.g. /[publicToken] on cola).
  if (pathname === "/admin/cola" || pathname.startsWith("/admin/cola/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/admin\/cola/, "/gob/cola");
    return NextResponse.redirect(url, { status: 308 });
  }

  if (pathname === "/admin/usuarios" || pathname.startsWith("/admin/usuarios/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/admin\/usuarios/, "/gob/usuarios");
    return NextResponse.redirect(url, { status: 308 });
  }

  if (pathname === "/admin/organizaciones" || pathname.startsWith("/admin/organizaciones/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/admin\/organizaciones/, "/gob/organizaciones");
    return NextResponse.redirect(url, { status: 308 });
  }

  // Permanent redirect: /admin/jurisdicciones/* -> /gob/reglas/* (admin-rules-
  // console, R1.6). The old .../[country]/[province]/[locality]/reglas/{...}
  // CRUD subtree dropped the trailing "/reglas" segment when it folded into
  // the unified surface (the "reglas" root is now /gob/reglas itself), so
  // this is a structural remap, not a straight prefix swap.
  const jurisdiccionesMatch = pathname.match(
    /^\/admin\/jurisdicciones(?:\/([^/]+)\/([^/]+)\/([^/]+)\/reglas((?:\/.*)?))?$/,
  );
  if (jurisdiccionesMatch) {
    const [, country, province, locality, rest] = jurisdiccionesMatch;
    const url = request.nextUrl.clone();
    url.pathname = country
      ? `/gob/reglas/${country}/${province}/${locality}${rest ?? ""}`
      : "/gob/reglas";
    return NextResponse.redirect(url, { status: 308 });
  }

  // Permanent redirect: /admin/servicios/* -> /gob/servicios/* (servicios
  // dedup, R5.3 — mirrors the AC3 cola/usuarios/organizaciones pattern).
  if (pathname === "/admin/servicios" || pathname.startsWith("/admin/servicios/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/admin\/servicios/, "/gob/servicios");
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
