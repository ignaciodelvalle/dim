// GET /gob/censo/export — CSV download for the Censo poblacional dashboard
// (Wave C, gob-audit-inventory item 2). See app/gob/poblacion/export/route.ts
// for the shared rationale (aggregate-only export, no Storage round-trip).

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
  DORMANT_MONTHS_DEFAULT,
  buildProjectionContext,
  identificationFunnel,
  registryByProvince,
  registryCounts,
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

  // Jurisdiction filter — identical logic to app/gob/censo/page.tsx.
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

  const [counts, funnel, provinceRows] = await Promise.all([
    registryCounts(ctx, DORMANT_MONTHS_DEFAULT),
    identificationFunnel(ctx),
    registryByProvince(ctx),
  ]);

  const summaryRows = [
    {
      total_registradas: counts.total,
      activas: counts.active,
      dormant: counts.dormant,
      perfiles_incompletos: counts.incomplete,
      con_chip: funnel.chipped,
      iso_valido: funnel.isoValid,
      escaneada_en_periodo: funnel.scanned,
    },
  ];

  const provinceRowsOut = provinceRows.map((r) => ({
    provincia: r.province,
    mascotas_registradas: r.count,
  }));

  const csvContent = buildSectionedCsv([
    { title: "resumen", rows: summaryRows },
    { title: "registro_por_provincia", rows: provinceRowsOut },
  ]);

  await logGobDashboardExport(user.id, "censo", {
    resumen: summaryRows.length,
    registro_por_provincia: provinceRowsOut.length,
  });

  const filename = `censo-${new Date().toISOString().slice(0, 10)}.csv`;
  return csvDownloadResponse(csvContent, filename);
}
