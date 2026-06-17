// Public index of verified shelters and rescue networks.
// No auth required. No PII exposed — only org display name, type, and
// jurisdiction (province / locality).
//
// @no-auth-required: public directory — queryable by anonymous visitors.

import { and, asc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { LnEmptyState } from "@/components/ui/EmptyState";

import { db, organizations } from "@/db";
import { PROVINCES } from "@/lib/ar-provincias";

// CI builds run without a database, so ISR prerender is not available.
// Use force-dynamic (matching every other public page in this repo) so
// Next.js never attempts a DB query at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Refugios y redes de rescate — MiMAR",
  description:
    "Refugios y redes de rescate verificados en el Registro Nacional de Mascotas. Encontrá una organización en tu provincia.",
};

const ORG_TYPE_LABELS: Record<string, string> = {
  shelter: "Refugio",
  rescue_network: "Red de rescate",
};

export default async function RefugiosIndexPage() {
  const rows = await db
    .select({
      publicToken: organizations.publicToken,
      displayName: organizations.displayName,
      orgType: organizations.orgType,
      jurisdictionProvince: organizations.jurisdictionProvince,
      jurisdictionLocality: organizations.jurisdictionLocality,
    })
    .from(organizations)
    .where(
      and(
        inArray(organizations.orgType, ["shelter", "rescue_network"]),
        eq(organizations.verified, true),
      ),
    )
    .orderBy(asc(organizations.jurisdictionProvince), asc(organizations.displayName))
    .limit(500);

  // Group by province for display.
  const byProvince = new Map<string, typeof rows>();
  for (const row of rows) {
    const province = row.jurisdictionProvince ?? "Sin provincia";
    const existing = byProvince.get(province) ?? [];
    existing.push(row);
    byProvince.set(province, existing);
  }

  // Sort provinces using the canonical PROVINCES order.
  const provinceOrder = new Map(PROVINCES.map((p, i) => [p.name as string, i]));
  const sortedProvinces = Array.from(byProvince.keys()).sort((a, b) => {
    const ia = provinceOrder.get(a) ?? 99;
    const ib = provinceOrder.get(b) ?? 99;
    return ia - ib;
  });

  return (
    <main id="main-content" className="min-h-screen bg-[var(--color-ln-paper)]">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <header className="space-y-2">
          <h1
            className="text-[30px] font-semibold tracking-[-0.015em] leading-tight text-[var(--color-ln-ink)]"
            style={{ fontFamily: "var(--font-ln-serif)" }}
          >
            Refugios y redes de rescate
          </h1>
          <p className="text-[14px] text-[var(--color-ln-mute)] max-w-xl">
            Organizaciones verificadas en el Registro Nacional de Mascotas. Si buscás un animal para
            adoptar o querés colaborar, encontrá una cerca tuyo.
          </p>
          <Link
            href="/adoptar"
            className="inline-block text-[12px] text-[var(--color-ln-azul)] no-underline hover:underline"
          >
            Ver animales en adopción →
          </Link>
        </header>

        {rows.length === 0 ? (
          <LnEmptyState icon="edificio" title="No hay refugios verificados registrados todavía." />
        ) : (
          <div className="space-y-10">
            {sortedProvinces.map((province) => {
              const items = byProvince.get(province) ?? [];
              return (
                <section key={province} className="space-y-3">
                  <h2 className="text-[11px] font-bold uppercase tracking-[.1em] text-[var(--color-ln-mute)] border-b border-[var(--color-ln-line)] pb-1">
                    {province}
                  </h2>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {items.map((org) => (
                      <li key={org.publicToken}>
                        <Link
                          href={`/refugios/${org.publicToken}`}
                          className="flex items-start gap-3 rounded-[6px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-4 py-3 no-underline transition-colors hover:bg-[var(--color-ln-stripe)]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-[var(--color-ln-ink)] truncate">
                              {org.displayName}
                            </p>
                            <p className="text-[11px] text-[var(--color-ln-mute)] mt-0.5">
                              {ORG_TYPE_LABELS[org.orgType] ?? org.orgType}
                              {org.jurisdictionLocality && ` · ${org.jurisdictionLocality}`}
                            </p>
                          </div>
                          <span
                            className="mt-0.5 flex-shrink-0 text-[11px] text-[var(--color-ln-azul)]"
                            aria-hidden="true"
                          >
                            →
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
