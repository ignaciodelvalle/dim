// GET /gob/adopciones/export — CSV download for the Adopciones dashboard
// (Wave C, gob-audit-inventory item 2). See app/gob/poblacion/export/route.ts
// for the shared rationale (aggregate-only export, no Storage round-trip).

import { type NextRequest, NextResponse } from "next/server";

import {
  buildSectionedCsv,
  csvDownloadResponse,
  logGobDashboardExport,
} from "@/lib/analytics/govt-dashboard-export";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  buildProjectionContext,
  fetchCustodyFunnel,
  fetchFosterPoolUtilization,
  fetchReturnRate,
  fetchShelterOccupancyNational,
  fetchTimeInState,
} from "@/lib/metrics";
import { resolveAnalyticsPeriod } from "@/lib/metrics/period";

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

  // Jurisdiction filter — identical logic to app/gob/adopciones/page.tsx.
  const { filteredJurisdictions } = await resolveJurisdictionScope({
    role: profile.role,
    jurisdictions,
    params: { province: searchParams.get("province"), locality: searchParams.get("locality") },
  });

  const period = resolveAnalyticsPeriod(sp);
  const actor = { role: profile.role } as const;
  const ctx = buildProjectionContext(actor, filteredJurisdictions, period);

  const [funnel, timeInState, returnRateValue, fosterPool, shelterOccupancy] = await Promise.all([
    fetchCustodyFunnel(ctx),
    fetchTimeInState(ctx),
    fetchReturnRate(ctx),
    fetchFosterPoolUtilization(ctx),
    fetchShelterOccupancyNational(ctx),
  ]);

  const returnRatePct = returnRateValue != null ? Math.round(returnRateValue * 1000) / 10 : "";

  const summaryRows = [
    {
      en_custodia_refugio: shelterOccupancy.occupied,
      en_transito_foster: fosterPool.activeFosterPlacements,
      adopciones_periodo: funnel.adoption,
      tasa_retorno_pct: returnRatePct,
      voluntarios_foster_activos: fosterPool.activeVolunteers,
      voluntarios_con_cupo: fosterPool.withCapacity,
    },
  ];

  const funnelRows = [
    { etapa: "Ingresos al refugio", cantidad: funnel.intake },
    { etapa: "Asignados a tránsito", cantidad: funnel.foster },
    { etapa: "Adopciones finalizadas", cantidad: funnel.adoption },
    { etapa: "Devoluciones", cantidad: funnel.reversed },
  ];

  const timeInStateRows = timeInState.map((r) => ({
    rol: r.role,
    mediana_dias: r.medianDays ?? "",
    p75_dias: r.p75Days ?? "",
    registros: r.n,
  }));

  const csvContent = buildSectionedCsv([
    { title: "resumen", rows: summaryRows },
    { title: "embudo_colocacion", rows: funnelRows },
    { title: "tiempo_en_estado", rows: timeInStateRows },
  ]);

  await logGobDashboardExport(user.id, "adopciones", {
    resumen: summaryRows.length,
    embudo_colocacion: funnelRows.length,
    tiempo_en_estado: timeInStateRows.length,
  });

  const filename = `adopciones-${new Date().toISOString().slice(0, 10)}.csv`;
  return csvDownloadResponse(csvContent, filename);
}
