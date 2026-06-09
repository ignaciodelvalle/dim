// /admin/jurisdicciones — list of provinces with rule counts.
// Spec 2026-05-19-govt-business-rules-poc-design §6.1.

import { sql } from "drizzle-orm";
import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
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
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin {"·"} Jurisdicciones
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Jurisdicciones</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Configura reglas de negocio scope-aware por pais, provincia o localidad. Sin overrides
          {" -> "}se usan los defaults nacionales.
        </p>
      </header>

      {/* Country-level */}
      <OpCard>
        <OpCardHead
          title="AR (pais)"
          actions={
            <span className="text-[12px] text-ln-op-mute">
              {countryWideCount} regla{countryWideCount === 1 ? "" : "s"}
            </span>
          }
        />
        <OpCardBody className="p-0">
          <ul>
            <li className="flex items-center justify-between border-t border-ln-op-line px-4 py-3">
              <span className="text-[13px] text-ln-op-ink-2">Reglas a nivel pais AR</span>
              <Link
                href={`/admin/jurisdicciones/${encodeURIComponent("AR")}/${encodeURIComponent("_")}/${encodeURIComponent("_")}/reglas`}
                className="text-[12px] font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
              >
                {"Ver reglas ->"}
              </Link>
            </li>
          </ul>
        </OpCardBody>
      </OpCard>

      {/* Provinces */}
      <OpCard>
        <OpCardHead title="Provincias" />
        <OpCardBody className="p-0">
          <ul>
            {PROVINCES.map((p) => {
              const count = countByProvince.get(p.name) ?? 0;
              return (
                <li
                  key={p.code}
                  className="flex items-center justify-between gap-3 border-t border-ln-op-line px-4 py-3"
                >
                  <div>
                    <p className="text-[13px] font-medium text-ln-op-ink">{p.name}</p>
                    <p className="text-[11px] text-ln-op-mute">
                      {count === 0
                        ? "Sin overrides (usando defaults)"
                        : `${count} regla${count === 1 ? "" : "s"} activa${count === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <Link
                    href={`/admin/jurisdicciones/${encodeURIComponent("AR")}/${encodeURIComponent(p.name)}/${encodeURIComponent("_")}/reglas`}
                    className="text-[12px] font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
                  >
                    {count === 0 ? "Crear regla ->" : "Ver reglas ->"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </OpCardBody>
      </OpCard>
    </div>
  );
}
