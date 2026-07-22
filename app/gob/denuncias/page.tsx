// /gob/denuncias — the Denuncias hub (C6a nav regroup,
// docs/reviews/results/2026-07-22-plan-maestro-integridad.md §C6).
//
// ONE front door for the citizen-report pipeline: Moderación → Triage
// (Maltrato) → Caso. PO-locked: "journey único de Denuncias" — the hub does
// NOT replace the three existing screens (they keep working untouched); it
// is an additive orientation layer that explains the pipeline in one line
// and hands off to each stage with a live, cheap count.
//
// Counts reuse the SAME predicate/fetcher each destination page already uses
// — no new query logic:
//   - Moderación: buildModerationQueueConditions (the exact "Pendientes"
//     predicate /gob/moderacion's own list uses), status: "pending".
//   - Triage (Maltrato): fetchOpenWelfareReportsCount — the catalogued
//     open_welfare_reports KPI (lib/metrics/kpi-catalog.ts), so this tile
//     gets the C1 metric-contract treatment (info tooltip, target/confidence)
//     for free via OpKpi's descriptorId.
//   - Caso: countCasesForAdmin/countCasesForGovt with status: "open" — the
//     same fetchers /admin/casos and /gob/casos already call.
// Moderación and Caso have no catalog descriptor that fits a plain queue-
// depth count (no target, no semaphore) — their OpKpi tiles render WITHOUT
// descriptorId, same as every other grandfathered OpKpi caller across the
// app (the C1 contract's "OpKpi only where a descriptor fits" rule: a bare
// tile, not a fabricated descriptor with no real target/semaphore behind it).

import Link from "next/link";

import { count } from "drizzle-orm";

import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { db, welfareReports } from "@/db";
import { buildModerationQueueConditions } from "@/lib/analytics/govt-dashboards";
import { fetchOpenWelfareReportsCount } from "@/lib/analytics/govt-home-kpis";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { countCasesForAdmin, countCasesForGovt } from "@/lib/infra/case-queries";
import { buildProjectionContext, windows } from "@/lib/metrics";

export const dynamic = "force-dynamic";

type StageCta = { label: string; href: string };

function StagePanel({
  step,
  title,
  description,
  value,
  unit,
  descriptorId,
  cta,
}: {
  step: string;
  title: string;
  description: string;
  value: number;
  unit: string;
  /** Only set for the stage whose count matches a catalogued KPI descriptor
   *  (C1 metric-contract) — the other two render as plain stat tiles (no
   *  descriptor fits a bare queue-depth count with no target/semaphore). */
  descriptorId?: "open_welfare_reports";
  cta: StageCta;
}) {
  return (
    <OpCard>
      <OpCardHead title={`${step} · ${title}`} />
      <OpCardBody className="space-y-4">
        <p className="text-[var(--text-md)] text-ln-op-ink-2">{description}</p>
        <OpKpi label={unit} value={value} descriptorId={descriptorId} />
        <Link
          href={cta.href}
          className="inline-flex text-sm font-semibold text-ln-op-azul no-underline hover:underline"
        >
          {cta.label} →
        </Link>
      </OpCardBody>
    </OpCard>
  );
}

export default async function GobDenunciasPage() {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role } as const;

  const noScope = profile.role === "govt" && jurisdictions.length === 0;

  // Cheap, jurisdiction-scoped counts only — no lists, no pagination.
  const ctx = buildProjectionContext(actor, jurisdictions, windows.trailing30d());

  const moderationWhere = buildModerationQueueConditions({
    actor,
    jurisdictions,
    status: "pending",
    includeEscalated: false,
  });

  const [moderationRows, triage, casosCount] = await Promise.all([
    db.select({ n: count() }).from(welfareReports).where(moderationWhere),
    fetchOpenWelfareReportsCount(ctx),
    profile.role === "admin"
      ? countCasesForAdmin({ status: "open" })
      : countCasesForGovt(jurisdictions, { status: "open" }),
  ]);

  const moderationCount = moderationRows[0]?.n ?? 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Denuncias</p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          El recorrido de una denuncia
        </h1>
        <p className="max-w-prose text-[var(--text-md)] text-ln-op-ink-2">
          Una denuncia ciudadana pasa por moderación, triage según Ley 14.346, y puede escalar a un
          caso regulatorio. Cada etapa vive en su propia pantalla — esta es la puerta de entrada.
        </p>
      </header>

      {noScope && (
        <div className="rounded-[var(--radius-md)] border border-ln-op-warn-bd border-l-[4px] border-l-ln-op-warn bg-ln-op-warn-bg px-4 py-3 text-sm text-ln-op-warn">
          Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos
          una.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StagePanel
          step="1"
          title="Moderación"
          description="Denuncias anónimas que las heurísticas marcaron para revisión antes de entrar al triage."
          value={moderationCount}
          unit="En cola"
          cta={{ label: "Ir a moderación", href: "/gob/moderacion" }}
        />
        <StagePanel
          step="2"
          title="Triage (Maltrato)"
          description="Denuncias ya visibles, clasificadas por severidad y tipo bajo la Ley 14.346."
          value={triage.count}
          unit="Activas"
          descriptorId="open_welfare_reports"
          cta={{ label: "Ir al triage", href: "/gob/maltrato" }}
        />
        <StagePanel
          step="3"
          title="Caso"
          description="Denuncias escaladas a un caso regulatorio, con seguimiento formal."
          value={casosCount}
          unit="Abiertos"
          cta={{ label: "Ver casos", href: "/gob/casos" }}
        />
      </div>
    </div>
  );
}
