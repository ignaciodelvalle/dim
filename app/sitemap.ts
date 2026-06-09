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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.mimar.gob.ar";

// Generous upper bound for the sitemap — both listing queries are already
// bounded by the same guards used everywhere else.
const SITEMAP_PAGE_SIZE = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
