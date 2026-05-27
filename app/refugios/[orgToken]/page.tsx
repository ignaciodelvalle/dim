// Public shelter profile (handoff Phase 2 — refugio público).
//
// Visibility gate (queryOrgPublicProfile): returns null for orgs that
// are NOT (verified AND orgType in shelter | rescue_network). Caller
// 404s — no degraded view, no "Refugio no disponible" placeholder
// (handoff P2 §"Visibility gate").
//
// This file is the P2-1 refactor base — extracts the inline pet-card
// markup to <AdoptionListingCard> and the inline org-select to
// queryOrgPublicProfile. Future panels (P2-2..P2-12) plug into the
// existing skeleton instead of re-querying.

import Link from "next/link";
import { notFound } from "next/navigation";

import { AdoptionListingCard } from "@/components/AdoptionListingCard";
import { queryAdoptionListing } from "@/lib/adoption-listing-query";
import { PROVINCES } from "@/lib/ar-provincias";
import { queryOrgPublicProfile } from "@/lib/org-public-profile";

import { OrgHero } from "./OrgHero";

export const dynamic = "force-dynamic";

const PROVINCE_BY_NAME = new Map<string, (typeof PROVINCES)[number]>(
  PROVINCES.map((p) => [p.name as string, p]),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const org = await queryOrgPublicProfile(orgToken);
  if (!org) return { title: "Refugio no disponible — MiMAR" };
  return {
    title: `${org.displayName} — Refugio en MiMAR`,
    description: `Mascotas en adopción publicadas por ${org.displayName}.`,
  };
}

export default async function RefugioPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;

  // Fan out the three queries — visibility gate + adoption listing +
  // public offerings (the offerings consumer ships in P2-5; the data
  // layer lives here from P2-1 so the page is a single fetch).
  const [org, { items, nextCursor }] = await Promise.all([
    queryOrgPublicProfile(orgToken),
    queryAdoptionListing({ organizationToken: orgToken }, null, 24),
  ]);

  if (!org) notFound();

  const provinceLabel =
    (org.jurisdictionProvince && PROVINCE_BY_NAME.get(org.jurisdictionProvince)?.name) ||
    org.jurisdictionProvince ||
    null;
  const localityLabel =
    org.jurisdictionLocality && provinceLabel
      ? `${org.jurisdictionLocality}, ${provinceLabel}`
      : (provinceLabel ?? org.jurisdictionLocality ?? null);

  return (
    <main className="min-h-screen bg-gob-surface">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        <Link
          href="/adoptar"
          className="inline-block text-sm text-gob-text-muted hover:text-gob-text"
        >
          ← Volver a /adoptar
        </Link>

        <OrgHero org={org} localityLabel={localityLabel} />

        {items.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-6 py-10 text-center space-y-2">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              {org.displayName} no tiene mascotas publicadas en adopción en este momento.
            </p>
            <Link
              href="/adoptar"
              className="text-sm text-emerald-700 dark:text-emerald-300 underline"
            >
              Ver mascotas de otros refugios
            </Link>
          </div>
        ) : (
          <>
            <p className="text-xs text-neutral-500">
              {items.length} mascota{items.length === 1 ? "" : "s"} publicada
              {items.length === 1 ? "" : "s"}
              {nextCursor ? " (mostrando las primeras 24)" : ""}
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <AdoptionListingCard key={item.petId} item={item} showPublisher={false} />
              ))}
            </ul>
            {nextCursor && (
              <div className="flex justify-center pt-4">
                <Link
                  href={`/adoptar?org=${orgToken}`}
                  className="px-5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  Ver todas
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
