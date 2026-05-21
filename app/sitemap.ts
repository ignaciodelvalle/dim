import type { MetadataRoute } from "next";

import { queryAdoptionListing } from "@/lib/adoption-listing-query";

// Sitemap hits the DB to enumerate adoptable pets — keep it out of the
// build-time prerender path so CI doesn't need DATABASE_URL. The route runs
// per-request in production behind Next's standard caching.
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.mimar.gob.ar";

// Generous upper bound for the sitemap — the listing query is already
// bounded by the same listability guards used everywhere else.
const SITEMAP_PAGE_SIZE = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/adoptar`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/denuncias/nueva`, changeFrequency: "monthly", priority: 0.6 },
  ];

  const { items } = await queryAdoptionListing({}, null, SITEMAP_PAGE_SIZE);
  const petRoutes: MetadataRoute.Sitemap = items.map((pet) => ({
    url: `${SITE_URL}/adoptar/${pet.petPublicToken}`,
    lastModified: pet.adoptionListedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...petRoutes];
}
