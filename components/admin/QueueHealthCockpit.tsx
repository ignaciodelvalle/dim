// QueueHealthCockpit — the /admin home operational cockpit (Epic D).
//
// WHY: the admin home used to show a single lumped "Cola pendiente" number that
// counted only pending approval_requests, while several other operational
// queues (moderación, alertas, outbox breaches, casos, observaciones) stayed
// invisible and the Novedades feed pointed at a different source entirely. This
// cockpit renders EVERY queue an admin owns as a compact tile with its live
// count and a jump-off to its page — approvals broken out per type.
//
// PRESENTATIONAL ONLY — no data fetching. The page computes the counts via
// `fetchQueueCockpit` (lib/analytics/admin-metrics) and passes them in.
//
// Server component: pure render, no interactivity. Uses design tokens only
// (ln-op-* / st-* via the .op-surface cascade) — no raw colours, no emojis.

import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import type { QueueCockpit } from "@/lib/analytics/admin-metrics";

type TileTone = "neutral" | "warn" | "danger";

// Token maps mirror OpKpi's toneCard/toneValue so the tiles read as one system
// with the KPI strip below. st-* tokens resolve to ln-op-* via .op-surface.
const TONE_CARD: Record<TileTone, string> = {
  neutral: "bg-ln-op-card border-ln-op-line",
  warn: "bg-[var(--color-st-warn-bg)] border-[var(--color-st-warn-bd)]",
  danger: "bg-[var(--color-st-err-bg)] border-[var(--color-st-err-bd)]",
};

const TONE_VALUE: Record<TileTone, string> = {
  neutral: "text-ln-op-ink",
  warn: "text-[var(--color-st-warn)]",
  danger: "text-[var(--color-st-err)]",
};

function QueueTile({
  href,
  label,
  count,
  tone,
  sub,
}: {
  href: string;
  label: string;
  count: number;
  tone: TileTone;
  sub?: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex min-h-[104px] flex-col rounded-[var(--radius-md)] border p-[12px_14px]",
        "no-underline text-inherit transition-colors hover:brightness-[0.98]",
        TONE_CARD[tone],
      ].join(" ")}
    >
      <span className="text-[var(--text-sm)] font-bold uppercase leading-tight tracking-[0.1em] text-ln-op-mute">
        {label}
      </span>
      <span
        className={[
          "mt-1.5 font-ln-serif text-[var(--text-2xl)] font-semibold leading-none tracking-[-0.02em]",
          TONE_VALUE[tone],
        ].join(" ")}
      >
        {count}
      </span>
      {sub ? <span className="mt-1 text-[var(--text-sm)] text-ln-op-mute">{sub}</span> : null}
      <span className="mt-auto pt-2 text-[var(--text-sm)] font-semibold text-ln-op-azul">
        Ir a la cola {"->"}
      </span>
    </Link>
  );
}

/** count > 0 → warn, else neutral. */
function warnIf(count: number): TileTone {
  return count > 0 ? "warn" : "neutral";
}

export function QueueHealthCockpit({ cockpit }: { cockpit: QueueCockpit }) {
  const { approvals } = cockpit;

  const oldestNote =
    approvals.oldestPendingDaysAgo != null
      ? `Más antigua pendiente: ${approvals.oldestPendingDaysAgo}d`
      : "Sin pendientes";

  return (
    <OpCard>
      <OpCardHead
        title="Estado de las colas"
        actions={
          <Link href="/admin/cola" className="hover:underline">
            Cola completa {"->"}
          </Link>
        }
      />
      <OpCardBody className="space-y-4">
        {/* Aprobaciones — the one queue that was a KPI, now broken out per type. */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[var(--text-sm)] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
              Aprobaciones {"·"} {approvals.pendingTotal} pendientes
            </h4>
            <span className="text-[var(--text-sm)] text-ln-op-mute">{oldestNote}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <QueueTile
              href="/admin/cola"
              label="Matrículas veterinarias"
              count={approvals.roleUpgradeVet}
              tone={warnIf(approvals.roleUpgradeVet)}
            />
            <QueueTile
              href="/admin/cola"
              label="Verificación de organizaciones"
              count={approvals.organizationVerification}
              tone={warnIf(approvals.organizationVerification)}
            />
            <QueueTile
              href="/admin/cola"
              label="Credenciales RUPGA"
              count={approvals.serviceDogCredentialVerification}
              tone={warnIf(approvals.serviceDogCredentialVerification)}
            />
          </div>
        </div>

        {/* Colas operativas — previously invisible on the home. */}
        <div className="space-y-2">
          <h4 className="text-[var(--text-sm)] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            Colas operativas
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <QueueTile
              href="/admin/moderacion"
              label="Moderación de denuncias"
              count={cockpit.moderationPending}
              tone={warnIf(cockpit.moderationPending)}
            />
            <QueueTile
              href="/admin/alertas"
              label="Alertas abiertas"
              count={cockpit.alertsOpen}
              tone={warnIf(cockpit.alertsOpen)}
            />
            <QueueTile
              href="/admin/outbox"
              label="Vencimientos de SLA (outbox)"
              count={cockpit.outboxBreaches}
              tone={cockpit.outboxBreaches > 0 ? "danger" : "neutral"}
            />
            <QueueTile
              href="/admin/casos"
              label="Casos abiertos"
              count={cockpit.casesOpen}
              tone={warnIf(cockpit.casesOpen)}
            />
            <QueueTile
              href="/admin/observaciones"
              label="Observaciones antirrábicas"
              count={cockpit.rabiesInProgress}
              tone={warnIf(cockpit.rabiesInProgress)}
            />
          </div>
        </div>
      </OpCardBody>
    </OpCard>
  );
}
