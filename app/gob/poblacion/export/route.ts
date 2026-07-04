// GET /gob/poblacion/export — CSV download for the Control poblacional
// dashboard (Wave C, gob-audit-inventory item 2).
//
// Mirrors /gob/outreach/export's direct-download pattern: this exports
// AGGREGATE rows (per-province sterilization coverage + a KPI summary), not
// raw pet-level PII, so no Storage upload / signed URL / email round-trip is
// needed — see lib/analytics/govt-dashboard-export.ts for the shared
// rationale. Respects the same province/locality/period query params the
// page itself reads, so "Exportar CSV" always matches what the operator is
// looking at.

import { type NextRequest, NextResponse } from "next/server";

import {
  buildSectionedCsv,
  csvDownloadResponse,
  logGobDashboardExport,
} from "@/lib/analytics/govt-dashboard-export";
import type { DashboardJurisdiction } from "@/lib/analytics/govt-dashboards";
import { localityByName } from "@/lib/infra/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  buildProjectionContext,
  fetchActivePregnancies,
  fetchNetGrowth,
  fetchReproductiveOutcomes,
  fetchSterilizationCoverage,
  fetchSterilizationNatalidadRatio,
} from "@/lib/metrics";
import { resolveAnalyticsPeriod } from "@/lib/metrics/period";
import { type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";

export async function GET(request: NextRequest): Promise<Response> {
  let profile: Awaited<ReturnType<typeof requireAdminOrGovtOrRedirect>>["profile"];
  let jurisdictions: Awaited<ReturnType<typeof requireAdminOrGovtOrRedirect>>["jurisdictions"];
  let user: Awaited<ReturnType<typeof requireAdminOrGovtOrRedirect>>["user"];

  try {
    ({ profile, jurisdictions, user } = await requireAdminOrGovtOrRedirect());
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const hasAccess =
    profile.role === "admin" || (profile.role === "govt" && jurisdictions.length > 0);
  if (!hasAccess) {
    return new NextResponse("Acceso denegado", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const sp = {
    period: searchParams.get("period") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  // Jurisdiction filter — identical logic to app/gob/poblacion/page.tsx so
  // the export always matches the active province/locality selection.
  const selectedProvinceIso = searchParams.get("province");
  const selectedLocalitySlug = searchParams.get("locality");
  const selectedProvinceObj = selectedProvinceIso ? provinceByCode(selectedProvinceIso) : null;

  const selectedLocalityRow =
    selectedProvinceObj && selectedLocalitySlug
      ? await localityByName(selectedProvinceObj.code as ProvinceCode, selectedLocalitySlug)
      : null;

  let filteredJurisdictions: DashboardJurisdiction[] = jurisdictions;
  if (selectedProvinceObj && profile.role !== "admin") {
    const provinceName = selectedProvinceObj.name;
    filteredJurisdictions = selectedLocalityRow
      ? jurisdictions.filter(
          (j) => j.province === provinceName && j.locality === selectedLocalityRow.localityName,
        )
      : jurisdictions.filter((j) => j.province === provinceName);
  }

  const period = resolveAnalyticsPeriod(sp);
  const actor = { role: profile.role } as const;
  const ctx = buildProjectionContext(actor, filteredJurisdictions, period);

  const [coverage, activePregnancies, outcomes, netGrowth, sterilNatalidadRatio] =
    await Promise.all([
      fetchSterilizationCoverage(ctx),
      fetchActivePregnancies(ctx),
      fetchReproductiveOutcomes(ctx),
      fetchNetGrowth(ctx),
      fetchSterilizationNatalidadRatio(ctx),
    ]);

  const summaryRows = [
    {
      cobertura_esterilizacion_pct: coverage.rate,
      mascotas_esterilizadas: coverage.sterilized,
      mascotas_total: coverage.total,
      preneces_activas: activePregnancies,
      nacimientos_registrados: outcomes.registeredBirths,
      balance_poblacional: netGrowth.net,
      ratio_esterilizacion_natalidad: sterilNatalidadRatio ?? "",
    },
  ];

  const provinceRows = coverage.byProvince.map((r) => ({
    provincia: r.province,
    mascotas_total: r.total,
    esterilizadas: r.sterilized,
    cobertura_pct: r.ratePct,
  }));

  const csvContent = buildSectionedCsv([
    { title: "resumen", rows: summaryRows },
    { title: "cobertura_por_provincia", rows: provinceRows },
  ]);

  await logGobDashboardExport(user.id, "poblacion", {
    resumen: summaryRows.length,
    cobertura_por_provincia: provinceRows.length,
  });

  const filename = `poblacion-${new Date().toISOString().slice(0, 10)}.csv`;
  return csvDownloadResponse(csvContent, filename);
}
