import { and, eq, inArray } from "drizzle-orm";
import type { MetadataRoute } from "next";

import { db, organizations } from "@/db";
import { queryAdoptionListing } from "@/src/modules/adoption/infrastructure/adoption-listing-read";
import { queryLostListing } from "@/src/modules/lost/infrastructure/lost-listing-read";

// Sitemap hits the DB to enumerate adoptable pets + lost pets + verified
// refugios — keep it out of the build-time prerender path so CI doesn't
// need DATABASE_URL. The route runs per-request in production behind
// Next's standard caching.
export const dynamic = "force-dynamic";

// NEXT_PUBLIC_SITE_URL is the single source of truth for the app's public
// origin (see docs/ops/production-deploy-plan.md "Site URL consistency").
// A wrong or missing value here is worse than a build failure: it ships a
// sitemap that silently advertises the wrong domain to search engines. Fail
// loud in production instead of falling back to a hardcoded guess; keep a
// harmless localhost fallback for local dev/CI where the route isn't hit.
function resolveSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (url) return url;
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set. Refusing to generate a sitemap with a guessed domain in production.",
    );
  }
  return "http://localhost:3000";
}

// Generous upper bound for the sitemap — both listing queries are already
// bounded by the same guards used everywhere else.
const SITEMAP_PAGE_SIZE = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Resolved per-request (not at module load) so this never runs during
  // `next build`'s static route analysis — only when the dynamic route is
  // actually hit, matching the lazy fail-closed pattern in lib/utils/dni-hash.ts.
  const SITE_URL = resolveSiteUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/adoptar`, changeFrequency: "hourly", priority: 0.9 },
    // /perdidas surfaces every pet currently in status='lost'. Hourly because
    // marked-lost / marked-found are owner actions that can land any moment.
    { url: `${SITE_URL}/perdidas`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/denuncias/nueva`, changeFrequency: "monthly", priority: 0.6 },
  ];

  const [{ items: adoptItems }, { items: lostItems }, orgs] = await Promise.all([
    queryAdoptionListing({}, null, SITEMAP_PAGE_SIZE),
    queryLostListing({}, null, SITEMAP_PAGE_SIZE),
    // Public refugio profiles — same visibility gate as queryOrgPublicProfile
    // (verified AND orgType in shelter | rescue_network). Handoff P2-10.
    db
      .select({ token: organizations.publicToken, updatedAt: organizations.updatedAt })
      .from(organizations)
      .where(
        and(
          eq(organizations.verified, true),
          inArray(organizations.orgType, ["shelter", "rescue_network"]),
        ),
      ),
  ]);

  const petRoutes: MetadataRoute.Sitemap = adoptItems.map((pet) => ({
    url: `${SITE_URL}/adoptar/${pet.petPublicToken}`,
    lastModified: pet.adoptionListedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Lost pets land on the public credential at /p/{token} — same surface
  // the QR code points to. The credential auto-promotes to Tier 1 LOST when
  // the pet's status is 'lost', so there is no /perdidas/{token} sub-route.
  const lostRoutes: MetadataRoute.Sitemap = lostItems.map((pet) => ({
    url: `${SITE_URL}/p/${pet.petPublicToken}`,
    lastModified: pet.markedLostAt,
    changeFrequency: "daily",
    priority: 0.85,
  }));

  const refugioRoutes: MetadataRoute.Sitemap = orgs.map((o) => ({
    url: `${SITE_URL}/refugios/${o.token}`,
    lastModified: o.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...petRoutes, ...lostRoutes, ...refugioRoutes];
}
