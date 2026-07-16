// /gob/moderacion — jurisdiction-scoped denuncia moderation queue (SDD phase 1).
//
// Roadmap/spec: docs/design/handoffs/2026-07-07-govt-jurisdiction-moderation-sdd.md
//
// Shows the flagged anonymous denuncia queue FILTERED to the viewer's assigned
// localities. Mirrors /admin/moderacion but scoped: it reuses the shared
// buildModerationQueueConditions predicate + the welfare jurisdiction scope, so
// there is no forked query. Flagged reports with no/ambiguous jurisdiction never
// match a govt scope pair — they stay admin-only (/admin/moderacion), never
// invisible to everyone.
//
// Gated by requireDenunciaModerationPrincipal ('denuncia.moderate'): admin sees
// the queue universally (empty jurisdictions), govt sees only their assignments.

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { OpButton, OpCallout, OpCard, OpCardBody, OpPill } from "@/components/ui/dashboard";
import { db, welfareReports } from "@/db";
import {
  type ModerationQueueStatus,
  buildModerationQueueConditions,
} from "@/lib/analytics/govt-dashboards";
import { requireDenunciaModerationPrincipal } from "@/lib/infra/auth-guards";
import { type FlagReason, reasonLabel } from "@/lib/infra/welfare-moderation";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { decodeCursor, keysetWhere, newerHref, olderHref } from "@/lib/utils/keyset-pagination";
import {
  WELFARE_REPORT_KINDS,
  WELFARE_REPORT_SEVERITIES,
  type WelfareReportKind,
  type WelfareReportSeverity,
  welfareReportKindLabel,
  welfareReportSeverityLabel,
} from "@/src/modules/welfare/domain/types";
import { and, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

type SeverityTone = "danger" | "open" | "neutral";

const SEVERITY_PILL: Record<string, SeverityTone> = {
  critical: "danger",
  high: "open",
  medium: "open",
  low: "neutral",
};

const MOD_STATUS_OPTIONS = [
  { value: "pending", label: "Pendientes" },
  { value: "resolved", label: "Resueltas" },
  { value: "all", label: "Todas" },
] as const;

const PAGE_SIZE = 50;

export default async function GobModeracionPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    kind?: string;
    severity?: string;
    cursor?: string;
  }>;
}) {
  const { profile, jurisdictions } = await requireDenunciaModerationPrincipal();
  const actor = { role: profile.role };
  const sp = await searchParams;

  const statusFilter: ModerationQueueStatus =
    sp.status === "resolved" || sp.status === "all" ? sp.status : "pending";
  const kindFilter =
    sp.kind && (WELFARE_REPORT_KINDS as readonly string[]).includes(sp.kind)
      ? (sp.kind as WelfareReportKind)
      : null;
  const severityFilter =
    sp.severity && (WELFARE_REPORT_SEVERITIES as readonly string[]).includes(sp.severity)
      ? (sp.severity as WelfareReportSeverity)
      : null;

  const hasFilters = statusFilter !== "pending" || kindFilter !== null || severityFilter !== null;
  const noScope = profile.role === "govt" && jurisdictions.length === 0;

  // Shared moderation predicate + jurisdiction scope (govt sees only their
  // localities; admin universal). Returns sql`false` for a govt with no scope.
  const baseWhere = buildModerationQueueConditions({
    actor,
    jurisdictions,
    status: statusFilter,
    kind: kindFilter,
    severity: severityFilter,
  });

  // Keyset (seek) pagination — same contract as /admin/moderacion:
  // DESC on (flaggedAt, id); flaggedAt is non-null by the query predicate.
  const cursorClause = keysetWhere(
    welfareReports.flaggedAt,
    welfareReports.id,
    decodeCursor(sp.cursor),
  );
  const rowsWhere = cursorClause ? and(baseWhere, cursorClause) : baseWhere;

  const rawRows = await db
    .select()
    .from(welfareReports)
    .where(rowsWhere)
    .orderBy(desc(welfareReports.flaggedAt), desc(welfareReports.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rawRows.length > PAGE_SIZE;
  const rows = hasMore ? rawRows.slice(0, PAGE_SIZE) : rawRows;

  const filterParams: Record<string, string | undefined> = {
    ...(statusFilter !== "pending" ? { status: statusFilter } : {}),
    ...(kindFilter ? { kind: kindFilter } : {}),
    ...(severityFilter ? { severity: severityFilter } : {}),
  };
  const lastRow = rows.at(-1);
  const olderLink =
    hasMore && lastRow?.flaggedAt
      ? olderHref("/gob/moderacion", filterParams, { ts: lastRow.flaggedAt, id: lastRow.id })
      : null;
  const newerLink = sp.cursor ? newerHref("/gob/moderacion", filterParams) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Moderación</p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Moderación de denuncias
        </h1>
        <p className="text-[var(--text-md)] text-ln-op-ink-2">
          Denuncias anónimas de tus localidades que las heurísticas marcaron para revisión, antes de
          que entren a la cola de triage. Aprobalas para pasarlas a triage, rechazalas como abuso, o
          escalalas al equipo de plataforma. Las denuncias sin jurisdicción claras las modera el
          equipo de plataforma.
        </p>
      </header>

      {noScope && (
        <div className="rounded-[var(--radius-md)] border border-ln-op-warn-bd border-l-[4px] border-l-ln-op-warn bg-ln-op-warn-bg px-4 py-3 text-sm text-ln-op-warn">
          Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos
          una para ver las denuncias de tu jurisdicción.
        </div>
      )}

      {/* Filter form */}
      <form action="/gob/moderacion" method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="mod-status" className="text-[var(--text-sm)] font-medium text-ln-op-mute">
            Estado
          </label>
          <select
            id="mod-status"
            name="status"
            defaultValue={statusFilter}
            className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[var(--text-md)] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            {MOD_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="mod-kind" className="text-[var(--text-sm)] font-medium text-ln-op-mute">
            Tipo de denuncia
          </label>
          <select
            id="mod-kind"
            name="kind"
            defaultValue={kindFilter ?? ""}
            className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[var(--text-md)] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            <option value="">Todos los tipos</option>
            {WELFARE_REPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {welfareReportKindLabel(k)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="mod-severity"
            className="text-[var(--text-sm)] font-medium text-ln-op-mute"
          >
            Severidad
          </label>
          <select
            id="mod-severity"
            name="severity"
            defaultValue={severityFilter ?? ""}
            className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[var(--text-md)] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            <option value="">Todas las severidades</option>
            {WELFARE_REPORT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {welfareReportSeverityLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <OpButton type="submit" variant="primary" size="sm">
          Filtrar
        </OpButton>
        {hasFilters && (
          <a
            href="/gob/moderacion"
            className="text-sm text-ln-op-mute underline underline-offset-4"
          >
            Limpiar filtros
          </a>
        )}
      </form>

      {rows.length === 0 ? (
        <OpCallout
          title={statusFilter === "pending" ? "Cola vacía" : "Sin resultados"}
          body={
            statusFilter === "pending"
              ? "No hay denuncias pendientes de moderación en tus localidades."
              : "No hay denuncias que coincidan con los filtros aplicados."
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const reasons = (r.flagReasons as string[]) ?? [];
            const severityTone: SeverityTone = SEVERITY_PILL[r.severity] ?? "neutral";
            return (
              <li key={r.id}>
                <OpCard accent="warn">
                  <Link
                    href={`/gob/moderacion/${r.id}`}
                    className="block no-underline transition-colors hover:bg-ln-op-stripe"
                  >
                    <OpCardBody>
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[var(--text-md)] font-semibold text-ln-op-ink">
                              {welfareReportKindLabel(r.kind)}
                            </p>
                            <OpPill tone={severityTone}>
                              {welfareReportSeverityLabel(r.severity)}
                            </OpPill>
                          </div>
                          <ul className="space-y-0.5">
                            {reasons.map((reason) => (
                              <li key={reason} className="text-sm text-ln-op-warn">
                                {"• "}
                                {reasonLabel(reason as FlagReason)}
                              </li>
                            ))}
                          </ul>
                          <p className="font-mono text-xs text-ln-op-faint">
                            {r.referenceCode}
                            {" · "}
                            {[r.jurisdictionLocality, r.jurisdictionProvince]
                              .filter(Boolean)
                              .join(", ")}
                            {" · "}
                            {r.flaggedAt && formatDateTime(r.flaggedAt)}
                            {r.moderationResolvedAt && (
                              <span className="ml-2 inline-flex items-center gap-1 text-ln-op-ok">
                                <Icon name="check" size={13} decorative /> resuelta{" "}
                                {formatDate(r.moderationResolvedAt)}
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-ln-op-azul">{"→"}</span>
                      </div>
                    </OpCardBody>
                  </Link>
                </OpCard>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination footer — keyset (seek) links preserve active filters. */}
      {(newerLink || olderLink) && (
        <nav
          aria-label="Paginación de moderación"
          className="flex items-center justify-between gap-4 border-t border-ln-op-line pt-4"
        >
          <div>
            {newerLink && (
              <Link
                href={newerLink}
                className="text-sm font-medium text-ln-op-azul no-underline hover:underline"
              >
                ← Más recientes
              </Link>
            )}
          </div>
          <div>
            {olderLink && (
              <Link
                href={olderLink}
                className="text-sm font-medium text-ln-op-azul no-underline hover:underline"
              >
                Ver más antiguas →
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
