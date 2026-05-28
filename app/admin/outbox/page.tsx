// Admin Outbox list — shows recent event notification outbox rows with filters.
//
// Design: pure server component, admin-gated via layout. JS-side filtering
// (same pattern as auditoria/page.tsx) — simple, no dynamic SQL complexity.
// Filter form uses <form method="get"> — no JS required.

import { desc } from "drizzle-orm";
import Link from "next/link";

import { db, eventNotificationOutbox } from "@/db";
import type { OutboxStatus } from "@/db";
import { applyOutboxFilters, buildBreachCue, buildStatusLabel } from "@/lib/outbox-list";

// Traffic-light emoji per breach cue value.
const BREACH_CUE_SYMBOL: Record<ReturnType<typeof buildBreachCue>, string> = {
  delivered: "🟢",
  ok: "🟡",
  breach: "🔴",
  failed: "⛔",
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

export default async function AdminOutboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    target_kind?: string;
    breach?: string;
    province?: string;
  }>;
}) {
  const sp = await searchParams;
  const filters = {
    status: sp.status?.trim() || undefined,
    target_kind: sp.target_kind?.trim() || undefined,
    breach: sp.breach?.trim() || undefined,
    province: sp.province?.trim() || undefined,
  };

  const hasFilters = Object.values(filters).some(Boolean);

  // Fetch recent rows — DB already ordered; JS-side filtering applied below.
  const rawRows = await db
    .select()
    .from(eventNotificationOutbox)
    .orderBy(desc(eventNotificationOutbox.createdAt))
    .limit(200);

  const rows = applyOutboxFilters(rawRows, filters);

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Outbox de notificaciones
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Últimas {rawRows.length} filas del outbox de eventos de notificación ENO/govt. Los items
            en rojo (🔴) están en incumplimiento de SLA.
          </p>
        </header>

        {/* Filters */}
        <form action="/admin/outbox" method="get" className="flex items-center gap-2 flex-wrap">
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            className="text-sm rounded-md border border-gob-border  bg-white  px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gob-primary "
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
            className="text-sm rounded-md border border-gob-border  bg-white  px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gob-primary "
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
            className="text-sm rounded-md border border-gob-border  bg-white  px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gob-primary "
          >
            <option value="">Todos (breach o no)</option>
            <option value="yes">Solo incumplimientos SLA</option>
            <option value="no">Solo dentro de SLA</option>
          </select>

          <input
            type="text"
            name="province"
            defaultValue={filters.province ?? ""}
            placeholder="Provincia (exacta)"
            className="text-sm rounded-md border border-gob-border  bg-white  px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gob-primary "
          />

          <button
            type="submit"
            className="text-sm px-3 py-1.5 rounded-md bg-gob-primary  text-white  hover:opacity-90"
          >
            Filtrar
          </button>

          {hasFilters && (
            <a
              href="/admin/outbox"
              className="text-xs text-gob-text-muted  underline underline-offset-4"
            >
              Limpiar filtros
            </a>
          )}
        </form>

        {/* Table */}
        {rows.length === 0 ? (
          <p className="text-sm text-gob-text-muted ">
            {hasFilters
              ? "No hay items que coincidan con los filtros aplicados."
              : "No hay items en el outbox."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-gob-border ">
                  <th className="pb-2 pr-4 text-xs font-medium text-gob-text-muted uppercase tracking-wider">
                    SLA
                  </th>
                  <th className="pb-2 pr-4 text-xs font-medium text-gob-text-muted uppercase tracking-wider">
                    Destino
                  </th>
                  <th className="pb-2 pr-4 text-xs font-medium text-gob-text-muted uppercase tracking-wider">
                    Jurisdicción
                  </th>
                  <th className="pb-2 pr-4 text-xs font-medium text-gob-text-muted uppercase tracking-wider">
                    Evento origen
                  </th>
                  <th className="pb-2 pr-4 text-xs font-medium text-gob-text-muted uppercase tracking-wider">
                    Intentos
                  </th>
                  <th className="pb-2 pr-4 text-xs font-medium text-gob-text-muted uppercase tracking-wider">
                    Creado
                  </th>
                  <th className="pb-2 pr-4 text-xs font-medium text-gob-text-muted uppercase tracking-wider">
                    SLA vence
                  </th>
                  <th className="pb-2 text-xs font-medium text-gob-text-muted uppercase tracking-wider">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gob-border ">
                {rows.map((row) => {
                  const cue = buildBreachCue(row.status, row.slaDueAt);
                  const symbol = BREACH_CUE_SYMBOL[cue];
                  const jurisdiction = [
                    row.targetJurisdictionLocality,
                    row.targetJurisdictionProvince,
                  ]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <tr key={row.id} className="hover:bg-gob-surface-alt ">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <span
                          title={`${buildStatusLabel(row.status)} · ${cue}`}
                          className="text-base"
                        >
                          {symbol}
                        </span>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-gob-text-gray ">
                        {TARGET_KIND_LABEL[row.targetKind] ?? row.targetKind}
                      </td>
                      <td className="py-2 pr-4 text-gob-text-gray  text-xs">
                        {jurisdiction || "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {/* Link to /admin/historial would need petId — sourceEventId is a
                            pet_events PK. Linking directly to the outbox detail is cleaner
                            for v1; historial integration can be added when the detail page
                            exposes the event context. */}
                        <span className="font-mono text-xs text-gob-text-muted ">
                          {row.sourceEventId.slice(0, 8)}…
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gob-text-gray  text-center">{row.attempts}</td>
                      <td className="py-2 pr-4 text-xs text-gob-text-muted whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-2 pr-4 text-xs text-gob-text-muted whitespace-nowrap">
                        {new Date(row.slaDueAt).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-2">
                        <Link
                          href={`/admin/outbox/${row.id}`}
                          className="text-xs underline underline-offset-2 text-gob-text-gray  hover:text-gob-text  whitespace-nowrap"
                        >
                          Detalle →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
