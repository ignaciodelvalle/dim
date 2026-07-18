// /gob/outbox — ENO SLA / notification monitor scoped to jurisdiction.
//
// Adapted from /admin/outbox/page.tsx.
//
// Key difference: for govt role, a jurisdiction WHERE clause is added to the
// outbox query so only rows matching the govt's assigned localities are visible:
//
//   OR of (targetJurisdictionProvince = j.province
//          AND targetJurisdictionLocality = j.locality)
//   over filteredJurisdictions
//
// Admin sees all rows (no jurisdiction filter).
//
// Privacy invariant: the WHERE clause below is the cross-tenant-leak boundary.
// A govt with assignments [{province:"Buenos Aires", locality:"La Plata"}] will
// see ONLY rows where (targetJurisdictionProvince='Buenos Aires' AND
// targetJurisdictionLocality='La Plata'). They cannot widen this because
// resolveScopedJurisdictions already ensured filteredJurisdictions ⊆ assignments.

import { and, desc, eq, lt, sql } from "drizzle-orm";
import Link from "next/link";

import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpBreach, OpButton, OpCard } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import {
  OUTBOX_STATUS_VALUES,
  OUTBOX_TARGET_KIND_LABEL,
  OUTBOX_TARGET_KIND_VALUES,
  OutboxTable,
  buildStatusLabel,
} from "@/components/ui/dashboard/OutboxTable";
import { db, eventNotificationOutbox } from "@/db";
import type { OutboxStatus, OutboxTargetKind } from "@/db";
import { PROVINCE_ISO_MAP } from "@/lib/analytics/govt-dashboards";
import { listLocalitiesByProvince, localityByName } from "@/lib/infra/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { buildBreachCue } from "@/lib/infra/outbox-list";
import { buildProjectionContext, jurisdictionPairClause } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { PROVINCES } from "@/lib/reference/ar-provincias";
import { type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";
import { pluralizeEs } from "@/lib/utils/format";
import { decodeCursor, keysetWhere, newerHref, olderHref } from "@/lib/utils/keyset-pagination";

// Set of canonical province names for filter validation.
const VALID_PROVINCE_NAMES = new Set<string>(PROVINCES.map((p) => p.name));

const OUTBOX_PAGE_LIMIT = 200;

export default async function GobOutboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    target_kind?: string;
    breach?: string;
    province?: string;
    cursor?: string;
  }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  // Capability guard: requires admin OR (govt AND has assignments).
  const hasAccess =
    profile.role === "admin" || (profile.role === "govt" && jurisdictions.length > 0);

  if (!hasAccess) {
    return (
      <div className="space-y-6">
        <LnEmptyState
          icon="lock"
          title="Sin acceso"
          description="Tu rol no tiene acceso al outbox. Pedile al admin que te asigne jurisdicciones."
        />
      </div>
    );
  }

  const sp = await searchParams;
  const actor = { role: profile.role } as const;
  const filters = {
    status: sp.status?.trim() || undefined,
    target_kind: sp.target_kind?.trim() || undefined,
    breach: sp.breach?.trim() || undefined,
    province: sp.province?.trim() || undefined,
  };

  // Build a scoped ProjectionContext for DashboardFreshnessFooter.
  // The outbox page has no period picker — trailing12m is the default window.
  const ctx = buildProjectionContext(actor, jurisdictions, windows.trailing12m());
  const rawCursor = sp.cursor;
  const cursor = decodeCursor(rawCursor);

  const hasFilters = Object.values(filters).some(Boolean);

  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous Drizzle SQL expression union
  const conditions: any[] = [];

  // --- Jurisdiction WHERE (privacy invariant) ---
  // For govt role: restrict to assigned (province, locality) pairs.
  // For admin: no restriction — all rows visible.
  if (profile.role === "govt" && jurisdictions.length > 0) {
    // Whole-province subsumption (jurisdictionPairClause): a whole-CABA operator
    // sees every CABA row — barrio-scoped or null-locality — not only rows whose
    // locality string exactly equals the whole-province name. A barrio-specific
    // assignment (CABA / Palermo) still keeps the exact pair. Previously this
    // hand-rolled an exact (province AND locality) pair, so a whole-province
    // operator saw "sin entregas" for deliveries it legitimately governs.
    const jurisClause = jurisdictionPairClause(
      jurisdictions,
      sql`${eventNotificationOutbox.targetJurisdictionProvince}`,
      sql`${eventNotificationOutbox.targetJurisdictionLocality}`,
    );
    if (jurisClause) conditions.push(jurisClause);
  }

  // --- User-facing filter conditions ---
  if (
    filters.status &&
    filters.breach !== "yes" &&
    (["pending", "delivered", "failed"] as string[]).includes(filters.status)
  ) {
    conditions.push(eq(eventNotificationOutbox.status, filters.status as OutboxStatus));
  }
  if (
    filters.target_kind &&
    (["govt_webhook", "eno_authority", "audit_export", "internal_dashboard"] as string[]).includes(
      filters.target_kind,
    )
  ) {
    conditions.push(
      eq(eventNotificationOutbox.targetKind, filters.target_kind as OutboxTargetKind),
    );
  }
  // Province filter: always applied within the jurisdiction WHERE above.
  if (filters.province && VALID_PROVINCE_NAMES.has(filters.province)) {
    conditions.push(eq(eventNotificationOutbox.targetJurisdictionProvince, filters.province));
  }
  if (filters.breach === "yes") {
    conditions.push(lt(eventNotificationOutbox.slaDueAt, sql`now()`));
    conditions.push(eq(eventNotificationOutbox.status, "pending"));
  } else if (filters.breach === "no") {
    conditions.push(
      sql`NOT (${eventNotificationOutbox.status} = 'pending' AND ${eventNotificationOutbox.slaDueAt} < now())`,
    );
  }

  const cursorClause = keysetWhere(
    eventNotificationOutbox.createdAt,
    eventNotificationOutbox.id,
    cursor,
  );
  if (cursorClause) conditions.push(cursorClause);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rawRows = await db
    .select()
    .from(eventNotificationOutbox)
    .where(whereClause)
    .orderBy(desc(eventNotificationOutbox.createdAt), desc(eventNotificationOutbox.id))
    .limit(OUTBOX_PAGE_LIMIT + 1);

  const hasMore = rawRows.length > OUTBOX_PAGE_LIMIT;
  const rows = hasMore ? rawRows.slice(0, OUTBOX_PAGE_LIMIT) : rawRows;

  const breachCount = rows.filter((r) => buildBreachCue(r.status, r.slaDueAt) === "breach").length;

  const filterParams: Record<string, string | undefined> = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.target_kind ? { target_kind: filters.target_kind } : {}),
    ...(filters.breach ? { breach: filters.breach } : {}),
    ...(filters.province ? { province: filters.province } : {}),
  };
  const lastRow = rows.at(-1);
  const olderLink =
    hasMore && lastRow
      ? olderHref("/gob/outbox", filterParams, { ts: lastRow.createdAt, id: lastRow.id })
      : null;
  const newerLink = rawCursor ? newerHref("/gob/outbox", filterParams) : null;

  // Build allowed provinces for the province filter dropdown.
  // Govt: only their assigned provinces. Admin: all provinces.
  const allowedProvinces =
    profile.role === "admin"
      ? PROVINCES
      : PROVINCES.filter((p) => jurisdictions.some((j) => j.province === p.name));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Gobierno · Bandeja de salida
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Cola de notificaciones — tu jurisdicción
        </h1>
        <p className="text-[13px] text-ln-op-ink-2">
          {hasFilters
            ? `${rows.length} ${pluralizeEs(rows.length, "fila")} con los filtros aplicados.`
            : `Últimas ${rows.length} filas de la bandeja de salida en tu jurisdicción asignada.`}
        </p>
      </header>

      {/* SLA breach banner */}
      {breachCount > 0 && (
        <OpBreach
          title={`${breachCount} ${pluralizeEs(breachCount, "item", "items")} en incumplimiento de SLA`}
          detail="Revisa los items marcados en rojo y reintenta si es necesario."
        />
      )}

      {/* Filters */}
      <form action="/gob/outbox" method="get" className="flex items-center gap-2 flex-wrap">
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className="text-[13px] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        >
          <option value="">Todos los estados</option>
          {OUTBOX_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {buildStatusLabel(s as OutboxStatus)}
            </option>
          ))}
        </select>

        <select
          name="target_kind"
          defaultValue={filters.target_kind ?? ""}
          className="text-[13px] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        >
          <option value="">Todos los destinos</option>
          {OUTBOX_TARGET_KIND_VALUES.map((k) => (
            <option key={k} value={k}>
              {OUTBOX_TARGET_KIND_LABEL[k]}
            </option>
          ))}
        </select>

        <select
          name="breach"
          defaultValue={filters.breach ?? ""}
          className="text-[13px] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        >
          <option value="">Todos (breach o no)</option>
          <option value="yes">Solo incumplimientos SLA</option>
          <option value="no">Solo dentro de SLA</option>
        </select>

        {/* Province filter: restricted to assigned provinces for govt */}
        <select
          name="province"
          defaultValue={filters.province ?? ""}
          className="text-[13px] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        >
          <option value="">
            {profile.role === "govt" ? "Todas tus provincias" : "Todas las provincias"}
          </option>
          {allowedProvinces.map((p) => (
            <option key={p.code} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>

        <OpButton type="submit" variant="primary" size="sm">
          Filtrar
        </OpButton>

        {hasFilters && (
          <a href="/gob/outbox" className="text-sm text-ln-op-mute underline underline-offset-4">
            Limpiar filtros
          </a>
        )}
      </form>

      {/* Table */}
      {rows.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute">
          {hasFilters
            ? "No hay items que coincidan con los filtros aplicados."
            : "No hay items en la bandeja de salida para tu jurisdicción."}
        </p>
      ) : (
        <OpCard>
          {/* Detail page is admin-only (/admin/outbox/[id] is admin-gated). A
              scoped /gob/outbox/[id] is a follow-up; the list already carries
              status/SLA/target so govt has no dead-end link (detailHrefFor
              returns null for govt → an inert "—" cell). Govt does not resolve
              source-event → pet links, so petTokenBySourceEventId is omitted. */}
          <OutboxTable
            rows={rows}
            caption="Cola de notificaciones salientes para tu jurisdicción, con estado SLA, destino y acciones"
            detailHrefFor={(row) => (profile.role === "admin" ? `/admin/outbox/${row.id}` : null)}
          />
        </OpCard>
      )}

      {/* Pagination footer */}
      {(newerLink || olderLink) && (
        <nav
          aria-label="Paginación de la bandeja de salida"
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
                Ver más antiguos →
              </Link>
            )}
          </div>
        </nav>
      )}

      <DashboardFreshnessFooter ctx={ctx} />
    </div>
  );
}
