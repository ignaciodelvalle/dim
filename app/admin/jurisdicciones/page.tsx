// /admin/jurisdicciones — list of provinces with rule counts.
// Spec 2026-05-19-govt-business-rules-poc-design §6.1.

import { sql } from "drizzle-orm";
import Link from "next/link";

import { db, govtBusinessRules } from "@/db";
import { PROVINCES } from "@/lib/ar-provincias";

export const dynamic = "force-dynamic";

export default async function AdminJurisdiccionesPage() {
  const rows = await db
    .select({
      country: govtBusinessRules.jurisdictionCountry,
      province: govtBusinessRules.jurisdictionProvince,
      count: sql<number>`count(*)::int`,
    })
    .from(govtBusinessRules)
    .groupBy(govtBusinessRules.jurisdictionCountry, govtBusinessRules.jurisdictionProvince);

  const countByProvince = new Map<string, number>();
  let countryWideCount = 0;
  for (const r of rows) {
    if (r.province === null) {
      countryWideCount += r.count;
    } else {
      countByProvince.set(r.province, (countByProvince.get(r.province) ?? 0) + r.count);
    }
  }

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-semibold text-gob-text">Jurisdicciones</h1>
          <p className="text-sm text-gob-text-gray mt-1">
            Configurá reglas de negocio scope-aware por país, provincia o localidad. Sin overrides →
            se usan los defaults nacionales.
          </p>
        </header>

        <section className="rounded-2xl border border-gob-border overflow-hidden">
          <div className="px-4 py-3 bg-gob-surface-alt border-b border-gob-border">
            <h2 className="text-sm font-semibold text-gob-text">AR (país)</h2>
            <p className="text-xs text-gob-text-muted">Reglas a nivel país: {countryWideCount}</p>
          </div>
          <ul className="divide-y divide-gob-border">
            <li className="px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-gob-text-gray">Reglas a nivel país AR</span>
              <Link
                href={`/admin/jurisdicciones/${encodeURIComponent("AR")}/${encodeURIComponent("_")}/${encodeURIComponent("_")}/reglas`}
                className="text-gob-text underline underline-offset-4"
              >
                Ver reglas →
              </Link>
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-gob-border overflow-hidden">
          <div className="px-4 py-3 bg-gob-surface-alt border-b border-gob-border">
            <h2 className="text-sm font-semibold text-gob-text">Provincias</h2>
          </div>
          <ul className="divide-y divide-gob-border">
            {PROVINCES.map((p) => {
              const count = countByProvince.get(p.name) ?? 0;
              return (
                <li key={p.code} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-medium text-gob-text">{p.name}</p>
                    <p className="text-xs text-gob-text-muted">
                      {count === 0
                        ? "Sin overrides (usando defaults)"
                        : `${count} regla${count === 1 ? "" : "s"} activa${count === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <Link
                    href={`/admin/jurisdicciones/${encodeURIComponent("AR")}/${encodeURIComponent(p.name)}/${encodeURIComponent("_")}/reglas`}
                    className="text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text"
                  >
                    {count === 0 ? "Crear regla →" : "Ver reglas →"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
