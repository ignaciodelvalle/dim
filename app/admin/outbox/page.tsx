// Admin Outbox list — shows recent event notification outbox rows with filters.
//
// Design: pure server component, admin-gated via layout. JS-side filtering
// (same pattern as auditoria/page.tsx) — simple, no dynamic SQL complexity.
// Filter form uses <form method="get"> — no JS required.

import { desc } from "drizzle-orm";
import Link from "next/link";

import { OpBreach, OpCard, OpPill } from "@/components/ui/dashboard";
import { db, eventNotificationOutbox } from "@/db";
import type { OutboxStatus } from "@/db";
import { applyOutboxFilters, buildBreachCue, buildStatusLabel } from "@/lib/outbox-list";

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
  audit_export: "Exportacion auditoria",
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

  const breachCount = rows.filter((r) => buildBreachCue(r.status, r.slaDueAt) === "breach").length;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin {"·"} Outbox
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Outbox de notificaciones</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Ultimas {rawRows.length} filas del outbox de eventos de notificacion ENO/govt.
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
          className="text-[13px] rounded-[6px] border border-ln-op-line bg-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
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
          className="text-[13px] rounded-[6px] border border-ln-op-line bg-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
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
          className="text-[13px] rounded-[6px] border border-ln-op-line bg-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
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
          className="text-[13px] rounded-[6px] border border-ln-op-line bg-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        />

        <button
          type="submit"
          className="text-[13px] px-3 py-1.5 rounded-[6px] bg-ln-op-navy text-white font-semibold hover:opacity-90"
        >
          Filtrar
        </button>

        {hasFilters && (
          <a
            href="/admin/outbox"
            className="text-[12px] text-ln-op-mute underline underline-offset-4"
          >
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
              <thead>
                <tr className="border-b border-ln-op-line">
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                    SLA
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                    Destino
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                    Jurisdiccion
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                    Evento origen
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                    Intentos
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                    Creado
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                    SLA vence
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute">
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
                      <td className="py-2 px-3 whitespace-nowrap text-[12px] text-ln-op-ink-2">
                        {TARGET_KIND_LABEL[row.targetKind] ?? row.targetKind}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-ln-op-ink-2">
                        {jurisdiction || "—"}
                      </td>
                      <td className="py-2 px-3">
                        {/* Link to /admin/historial would need petId — sourceEventId is a
                            pet_events PK. Linking directly to the outbox detail is cleaner
                            for v1; historial integration can be added when the detail page
                            exposes the event context. */}
                        <span className="font-mono text-[11px] text-ln-op-mute">
                          {row.sourceEventId.slice(0, 8)}
                          {"..."}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[12px] text-ln-op-ink-2 text-center">
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
                          className="text-[12px] font-semibold text-ln-op-azul no-underline underline-offset-2 hover:underline whitespace-nowrap"
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
    </div>
  );
}
