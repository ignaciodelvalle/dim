// Admin Outbox list — shows recent event notification outbox rows with filters.
//
// Design: pure server component, admin-gated via layout. Filters are pushed
// into the SQL WHERE clause so the result set is correct regardless of total
// outbox size — the previous JS-side filter over LIMIT 200 silently missed
// matching rows beyond position 200 (P1-12).
// Filter form uses <form method="get"> — no JS required.

import { decodeCursor, keysetWhere, newerHref, olderHref } from "@/lib/utils/keyset-pagination";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import Link from "next/link";

import { OpBreach, OpButton, OpCard, OpPill } from "@/components/ui/dashboard";
import { db, eventNotificationOutbox, petEvents, pets } from "@/db";
import type { OutboxStatus, OutboxTargetKind } from "@/db";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { buildBreachCue, buildStatusLabel } from "@/lib/infra/outbox-list";
import { countOutboxBreaches } from "@/lib/infra/outbox-queries";
import { PROVINCES } from "@/lib/reference/ar-provincias";

// Set of canonical province names for filter validation.
const VALID_PROVINCE_NAMES = new Set<string>(PROVINCES.map((p) => p.name));

// Tone map per breach cue value.
type BreachCue = ReturnType<typeof buildBreachCue>;
const BREACH_CUE_SYMBOL: Record<BreachCue, string> = {
  delivered: "ok",
  ok: "ok",
  breach: "breach",
  failed: "failed",
};

type PillTone = "ok" | "neutral" | "danger" | "escalated";
const BREACH_PILL_TONE: Record<BreachCue, PillTone> = {
  delivered: "ok",
  ok: "neutral",
  breach: "danger",
  failed: "escalated",
};

const BREACH_PILL_LABEL: Record<BreachCue, string> = {
  delivered: "Entregado",
  ok: "En SLA",
  breach: "Incumplimiento",
  failed: "Fallido",
};

const TARGET_KIND_LABEL: Record<string, string> = {
  govt_webhook: "Webhook govt",
  eno_authority: "Autoridad ENO",
  audit_export: "Exportación auditoría",
  internal_dashboard: "Dashboard interno",
};

const TARGET_KIND_VALUES = [
  "govt_webhook",
  "eno_authority",
  "audit_export",
  "internal_dashboard",
] as const;

const STATUS_VALUES = ["pending", "delivered", "failed"] as const;

const OUTBOX_PAGE_LIMIT = 200;

export default async function AdminOutboxPage({
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
  await requireAdminOrRedirect();

  const sp = await searchParams;
  const filters = {
    status: sp.status?.trim() || undefined,
    target_kind: sp.target_kind?.trim() || undefined,
    breach: sp.breach?.trim() || undefined,
    province: sp.province?.trim() || undefined,
  };
  const rawCursor = sp.cursor;
  const cursor = decodeCursor(rawCursor);

  const hasFilters = Object.values(filters).some(Boolean);

  // Build SQL WHERE clauses for each active filter so the LIMIT is applied
  // AFTER narrowing — prevents silently missing matching rows beyond 200 (P1-12).
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous Drizzle SQL expression union
  const conditions: any[] = [];
  // When breach=yes, status is implied to be 'pending' — skip the standalone status
  // condition to avoid the always-false contradiction (e.g. status='delivered' AND status='pending').
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
  // Province: only push condition when the value is a known canonical province name.
  if (filters.province && VALID_PROVINCE_NAMES.has(filters.province)) {
    conditions.push(eq(eventNotificationOutbox.targetJurisdictionProvince, filters.province));
  }
  // breach filter: "yes" → pending AND slaDueAt < now() (skip separate status condition —
  // breach already implies pending, combining them produces status='delivered' AND status='pending'
  // which is always-false); "no" → NOT (pending AND slaDueAt < now()).
  if (filters.breach === "yes") {
    conditions.push(lt(eventNotificationOutbox.slaDueAt, sql`now()`));
    conditions.push(eq(eventNotificationOutbox.status, "pending"));
  } else if (filters.breach === "no") {
    conditions.push(
      sql`NOT (${eventNotificationOutbox.status} = 'pending' AND ${eventNotificationOutbox.slaDueAt} < now())`,
    );
  }

  // Keyset predicate — AND-composed with filter conditions so limit is applied after narrowing.
  const cursorClause = keysetWhere(
    eventNotificationOutbox.createdAt,
    eventNotificationOutbox.id,
    cursor,
  );
  if (cursorClause) conditions.push(cursorClause);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch limit+1 to detect hasMore for keyset pagination (PERF-5).
  const rawRows = await db
    .select()
    .from(eventNotificationOutbox)
    .where(whereClause)
    .orderBy(desc(eventNotificationOutbox.createdAt), desc(eventNotificationOutbox.id))
    .limit(OUTBOX_PAGE_LIMIT + 1);

  const hasMore = rawRows.length > OUTBOX_PAGE_LIMIT;
  const rows = hasMore ? rawRows.slice(0, OUTBOX_PAGE_LIMIT) : rawRows;

  // Banner count is GLOBAL (same predicate as the nav badge in layout.tsx), not
  // derived from the visible page — otherwise it sub-reports breaches that live
  // beyond page 1 and disagrees with the badge (C2). Per-row cues below still
  // use buildBreachCue for the page.
  const breachCount = await countOutboxBreaches();

  // Batch-resolve sourceEventId → pet publicToken for the "Evento origen" column.
  // One query: join pet_events → pets for all sourceEventIds on the current page.
  const uniqueSourceEventIds = [...new Set(rows.map((r) => r.sourceEventId))];
  const sourceEventPetTokenMap = new Map<string, string>(); // sourceEventId → pet publicToken
  if (uniqueSourceEventIds.length > 0) {
    const resolved = await db
      .select({ eventId: petEvents.id, publicToken: pets.publicToken })
      .from(petEvents)
      .innerJoin(pets, eq(petEvents.petId, pets.id))
      .where(inArray(petEvents.id, uniqueSourceEventIds));
    for (const r of resolved) {
      sourceEventPetTokenMap.set(r.eventId, r.publicToken);
    }
  }

  // Pagination links — filter params exclude cursor so changing a filter resets to page 1.
  const filterParams: Record<string, string | undefined> = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.target_kind ? { target_kind: filters.target_kind } : {}),
    ...(filters.breach ? { breach: filters.breach } : {}),
    ...(filters.province ? { province: filters.province } : {}),
  };
  const lastRow = rows.at(-1);
  const olderLink =
    hasMore && lastRow
      ? olderHref("/admin/outbox", filterParams, { ts: lastRow.createdAt, id: lastRow.id })
      : null;
  const newerLink = rawCursor ? newerHref("/admin/outbox", filterParams) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin {"·"} Outbox
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Outbox de notificaciones</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          {hasFilters
            ? `${rows.length} fila${rows.length === 1 ? "" : "s"} con los filtros aplicados.`
            : `Últimas ${rows.length} filas del outbox de eventos de notificación ENO/govt.`}
        </p>
      </header>

      {/* SLA breach banner */}
      {breachCount > 0 && (
        <OpBreach
          title={`${breachCount} item${breachCount === 1 ? "" : "s"} en incumplimiento de SLA`}
          detail="Revisa los items marcados en rojo y reintenta si es necesario."
        />
      )}

      {/* Filters */}
      <form action="/admin/outbox" method="get" className="flex items-center gap-2 flex-wrap">
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className="text-[13px] rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        >
          <option value="">Todos los estados</option>
          {STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {buildStatusLabel(s as OutboxStatus)}
            </option>
          ))}
        </select>

        <select
          name="target_kind"
          defaultValue={filters.target_kind ?? ""}
          className="text-[13px] rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        >
          <option value="">Todos los destinos</option>
          {TARGET_KIND_VALUES.map((k) => (
            <option key={k} value={k}>
              {TARGET_KIND_LABEL[k]}
            </option>
          ))}
        </select>

        <select
          name="breach"
          defaultValue={filters.breach ?? ""}
          className="text-[13px] rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        >
          <option value="">Todos (breach o no)</option>
          <option value="yes">Solo incumplimientos SLA</option>
          <option value="no">Solo dentro de SLA</option>
        </select>

        <select
          name="province"
          defaultValue={filters.province ?? ""}
          className="text-[13px] rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        >
          <option value="">Todas las provincias</option>
          {PROVINCES.map((p) => (
            <option key={p.code} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>

        <OpButton type="submit" variant="primary" size="sm">
          Filtrar
        </OpButton>

        {hasFilters && (
          <a href="/admin/outbox" className="text-sm text-ln-op-mute underline underline-offset-4">
            Limpiar filtros
          </a>
        )}
      </form>

      {/* Table */}
      {rows.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute">
          {hasFilters
            ? "No hay items que coincidan con los filtros aplicados."
            : "No hay items en el outbox."}
        </p>
      ) : (
        <OpCard>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">
                Cola de notificaciones salientes con estado SLA, destino y acciones
              </caption>
              <thead>
                <tr className="border-b border-ln-op-line">
                  <th
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                  >
                    SLA
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                  >
                    Destino
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                  >
                    Jurisdiccion
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                  >
                    Evento origen
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                  >
                    Intentos
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                  >
                    Creado
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                  >
                    SLA vence
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                  >
                    Accion
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const cue = buildBreachCue(row.status, row.slaDueAt);
                  const jurisdiction = [
                    row.targetJurisdictionLocality,
                    row.targetJurisdictionProvince,
                  ]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <tr
                      key={row.id}
                      className={`border-t border-ln-op-line ${cue === "breach" ? "bg-ln-op-danger-bg" : "hover:bg-ln-op-stripe"}`}
                    >
                      <td className="py-2 px-3 whitespace-nowrap">
                        <OpPill tone={BREACH_PILL_TONE[cue]}>{BREACH_PILL_LABEL[cue]}</OpPill>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-sm text-ln-op-ink-2">
                        {TARGET_KIND_LABEL[row.targetKind] ?? row.targetKind}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-ln-op-ink-2">
                        {jurisdiction || "—"}
                      </td>
                      <td className="py-2 px-3">
                        {sourceEventPetTokenMap.has(row.sourceEventId) ? (
                          <Link
                            href={`/p/${sourceEventPetTokenMap.get(row.sourceEventId)}`}
                            className="font-mono text-[11px] text-ln-op-azul underline underline-offset-2 hover:opacity-80 whitespace-nowrap"
                          >
                            {row.sourceEventId.slice(0, 8)}
                            {"…"}
                          </Link>
                        ) : (
                          <span className="font-mono text-[11px] text-ln-op-mute">
                            {row.sourceEventId.slice(0, 8)}
                            {"…"}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-sm text-ln-op-ink-2 text-center">
                        {row.attempts}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-ln-op-mute whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-ln-op-mute whitespace-nowrap">
                        {new Date(row.slaDueAt).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-2 px-3">
                        <Link
                          href={`/admin/outbox/${row.id}`}
                          className="text-sm font-semibold text-ln-op-azul no-underline underline-offset-2 hover:underline whitespace-nowrap"
                        >
                          {"Detalle ->"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </OpCard>
      )}

      {/* Pagination footer */}
      {(newerLink || olderLink) && (
        <nav
          aria-label="Paginación de outbox"
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
    </div>
  );
}
