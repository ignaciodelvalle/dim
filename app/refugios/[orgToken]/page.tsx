import Link from "next/link";
import { notFound } from "next/navigation";

import { eq } from "drizzle-orm";

import { db, organizations } from "@/db";
import {
  ageBucketLabel,
  energyLabel,
  queryAdoptionListing,
  sizeLabel,
} from "@/lib/adoption-listing";
import { PROVINCES } from "@/lib/ar-provincias";
import { petPhotoUrl } from "@/lib/storage";

// Public shelter profile (spec adoption-listing-public §12 Fase 6).
// Renders the shelter's basic identity + their current adoption listings
// using the same projection as /adoptar, scoped by organizationToken.
//
// Visibility predicate: an org appears here only if it is verified and
// of orgType shelter | rescue_network. Other org types (clinic, govt,
// etc.) 404 — the URL is a public-facing handle for shelters specifically.

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
  const [org] = await db
    .select({
      displayName: organizations.displayName,
      verified: organizations.verified,
      orgType: organizations.orgType,
    })
    .from(organizations)
    .where(eq(organizations.publicToken, orgToken))
    .limit(1);
  if (!org || !org.verified || (org.orgType !== "shelter" && org.orgType !== "rescue_network")) {
    return { title: "Refugio no disponible — MiMAR" };
  }
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

  const [org] = await db
    .select({
      displayName: organizations.displayName,
      legalName: organizations.legalName,
      verified: organizations.verified,
      orgType: organizations.orgType,
      jurisdictionProvince: organizations.jurisdictionProvince,
      jurisdictionLocality: organizations.jurisdictionLocality,
      email: organizations.email,
      phone: organizations.phone,
      website: organizations.website,
    })
    .from(organizations)
    .where(eq(organizations.publicToken, orgToken))
    .limit(1);

  if (!org || !org.verified || (org.orgType !== "shelter" && org.orgType !== "rescue_network")) {
    notFound();
  }

  // Same projection as /adoptar, scoped to this org. The query already
  // applies all 4 cross-spec guards; we don't paginate here — we just take
  // the first page. If a shelter has more than 24 pets in adoption we
  // surface a link to /adoptar?org=token for the full filtered feed.
  const { items, nextCursor } = await queryAdoptionListing(
    { organizationToken: orgToken },
    null,
    24,
  );

  const provinceLabel =
    (org.jurisdictionProvince && PROVINCE_BY_NAME.get(org.jurisdictionProvince)?.name) ||
    org.jurisdictionProvince ||
    null;

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <Link
          href="/adoptar"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a /adoptar
        </Link>

        <header className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {org.displayName}
          </h1>
          {(provinceLabel || org.jurisdictionLocality) && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {org.jurisdictionLocality && provinceLabel
                ? `${org.jurisdictionLocality}, ${provinceLabel}`
                : (provinceLabel ?? org.jurisdictionLocality)}
            </p>
          )}
          {(org.email || org.phone || org.website) && (
            <div className="text-xs text-neutral-500 space-x-3">
              {org.email && (
                <a href={`mailto:${org.email}`} className="underline">
                  {org.email}
                </a>
              )}
              {org.phone && <span>· {org.phone}</span>}
              {org.website && (
                <a
                  href={org.website.startsWith("http") ? org.website : `https://${org.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  · {org.website}
                </a>
              )}
            </div>
          )}
          <p className="text-xs text-neutral-500">
            Refugio verificado por MiMAR. Las postulaciones llegan directo al equipo del refugio,
            que coordina los próximos pasos por email con cada candidato.
          </p>
        </header>

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
                <li
                  key={item.petId}
                  className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-950 hover:shadow-lg transition-shadow"
                >
                  <Link href={`/adoptar/${item.petPublicToken}`} className="block">
                    <div className="aspect-square bg-neutral-100 dark:bg-neutral-900 relative">
                      {petPhotoUrl(item.primaryPhotoStoragePath) ? (
                        <img
                          src={petPhotoUrl(item.primaryPhotoStoragePath) ?? ""}
                          alt={item.name}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-5xl text-neutral-400 dark:text-neutral-600">
                          {item.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {(item.isSterilized || item.microchipId) && (
                        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                          {item.isSterilized && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                              {item.sex === "female" ? "Castrada" : "Castrado"}
                            </span>
                          )}
                          {item.microchipId && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-600 text-white">
                              Con chip
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="p-4 space-y-2">
                      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                        {item.name}
                      </h2>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        {[
                          item.adoptionAgeBucket &&
                            ageBucketLabel(item.adoptionAgeBucket, item.sex),
                          item.adoptionSizeEstimate && sizeLabel(item.adoptionSizeEstimate),
                          item.adoptionEnergyLevel && energyLabel(item.adoptionEnergyLevel),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {item.adoptionStory && (
                        <p className="text-xs text-neutral-700 dark:text-neutral-300 line-clamp-3">
                          {item.adoptionStory}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
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
