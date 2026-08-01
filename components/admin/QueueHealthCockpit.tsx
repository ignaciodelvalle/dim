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

import { Icon } from "@/components/Icon";
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
      <span className="text-sm font-bold uppercase leading-tight tracking-[0.1em] text-ln-op-mute">
        {label}
      </span>
      <span
        className={[
          "mt-1.5 font-ln-serif text-2xl font-semibold leading-none tracking-[-0.02em] tabular-nums",
          TONE_VALUE[tone],
        ].join(" ")}
      >
        {count}
      </span>
      {sub ? <span className="mt-1 text-sm text-ln-op-mute">{sub}</span> : null}
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
          // The single GLOBAL unfiltered jump-off. Each tile below deep-links to
          // its OWN filtered queue, so this is the only link to the full cola.
          <Link href="/admin/cola" className="inline-flex items-center gap-1 hover:underline">
            Ver cola completa
            <Icon name="chevron-right" size="sm" decorative />
          </Link>
        }
      />
      <OpCardBody className="space-y-4">
        {/* Aprobaciones — the one queue that was a KPI, now broken out per type. */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-ln-op-mute">
              Aprobaciones {"·"} {approvals.pendingTotal} pendientes
            </h4>
            <span className="text-sm text-ln-op-mute">{oldestNote}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Each approval tile deep-links to its OWN filtered queue via ?type=
                (the cola page validates it against APPROVAL_REQUEST_TYPES —
                app/gob/cola/page.tsx) so the tile lands on exactly the queue it
                counts, not the lumped list. */}
            <QueueTile
              href="/admin/cola?type=role_upgrade_vet"
              label="Matrículas veterinarias"
              count={approvals.roleUpgradeVet}
              tone={warnIf(approvals.roleUpgradeVet)}
            />
            <QueueTile
              href="/admin/cola?type=organization_verification"
              label="Verificación de organizaciones"
              count={approvals.organizationVerification}
              tone={warnIf(approvals.organizationVerification)}
            />
            <QueueTile
              href="/admin/cola?type=service_dog_credential_verification"
              label="Credenciales RUPGA"
              count={approvals.serviceDogCredentialVerification}
              tone={warnIf(approvals.serviceDogCredentialVerification)}
            />
          </div>
        </div>

        {/* Colas operativas — previously invisible on the home. */}
        <div className="space-y-2">
          <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            Colas operativas
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <QueueTile
              // The Denuncias hub's Moderación stage, addressed directly.
              // /admin/moderacion is a redirect-only shim since the F1 fusion
              // (buildDenunciasHubRedirectUrl(sp, "moderacion")), so the old
              // href cost the admin a hop to reach exactly this URL
              // (link-integrity.test.ts block 5, 2026-08-01). The cross-portal
              // jump into /gob chrome is unchanged and still the documented
              // exception recorded on the ADMIN_NAV "Moderación" entry — this
              // only removes the bounce, not the jump.
              href="/gob/denuncias?etapa=moderacion"
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
              // Deep-link to the breached rows only (breach=yes → pending AND
              // past SLA — app/admin/outbox/page.tsx), not the full outbox.
              href="/admin/outbox?breach=yes"
              label="Vencimientos de SLA (outbox)"
              count={cockpit.outboxBreaches}
              tone={cockpit.outboxBreaches > 0 ? "danger" : "neutral"}
            />
            <QueueTile
              href="/admin/casos"
              label="Casos abiertos"
              count={cockpit.casesOpen}
              // W2: open cases are ongoing INVENTORY, not a "decide now" alarm.
              // Warm tones are reserved for tiles that need an operator decision
              // this moment (pending approvals, moderación, alertas, SLA breaches,
              // observaciones en curso). A large open-cases count competing in
              // orange next to the pink SLA breach mis-ranks attention, so this
              // tile stays NEUTRAL regardless of count.
              tone="neutral"
            />
            <QueueTile
              href="/admin/observaciones"
              // red-team-admin #3: this counts only in-progress observations, so
              // a "0" here sits next to a full /admin/observaciones list (which
              // also shows recently-closed ones) — "(en curso)" preempts that.
              label="Observaciones antirrábicas (en curso)"
              count={cockpit.rabiesInProgress}
              tone={warnIf(cockpit.rabiesInProgress)}
            />
          </div>
        </div>
      </OpCardBody>
    </OpCard>
  );
}
