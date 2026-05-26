import type { MetadataRoute } from "next";

import { queryAdoptionListing } from "@/lib/adoption-listing-query";
import { queryLostListing } from "@/lib/lost-listing-query";

// Sitemap hits the DB to enumerate adoptable + lost pets — keep it out of
// the build-time prerender path so CI doesn't need DATABASE_URL. The route
// runs per-request in production behind Next's standard caching.
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.mimar.gob.ar";

// Generous upper bound for the sitemap — both listing queries are already
// bounded by the same listability/lost guards used everywhere else.
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

  const [{ items: adoptItems }, { items: lostItems }] = await Promise.all([
    queryAdoptionListing({}, null, SITEMAP_PAGE_SIZE),
    queryLostListing({}, null, SITEMAP_PAGE_SIZE),
  ]);

  const adoptRoutes: MetadataRoute.Sitemap = adoptItems.map((pet) => ({
    url: `${SITE_URL}/adoptar/${pet.petPublicToken}`,
    lastModified: pet.adoptionListedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Lost pets land on the public credential at /p/{token} — same surface
  // adopt listings used to point to before the dedicated /adoptar/{token}
  // page shipped. The credential auto-promotes to Tier 1 LOST when the
  // pet's status is 'lost', so there is no /perdidas/{token} sub-route.
  const lostRoutes: MetadataRoute.Sitemap = lostItems.map((pet) => ({
    url: `${SITE_URL}/p/${pet.petPublicToken}`,
    lastModified: pet.markedLostAt,
    changeFrequency: "daily",
    priority: 0.85,
  }));

  return [...staticRoutes, ...adoptRoutes, ...lostRoutes];
}
