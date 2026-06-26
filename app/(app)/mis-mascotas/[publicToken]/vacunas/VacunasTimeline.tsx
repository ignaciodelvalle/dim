// VacunasTimeline — server component composing the vaccine libreta view.
//
// Block 0 — "Estado de vacunación": 3 summary badges (Al día / Por vencer / Vencida).
// Panel 1 — "Próximas": only shown when there are active reminders.
// Panel 2 — "Histórico": always shown. EmptyState when no history.

import Link from "next/link";

import { ReminderCard } from "@/components/ReminderCard";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { computeConfidence } from "@/lib/event-confidence";
import type { VaccinationSummary } from "@/lib/libreta-health-status";
import type { ActiveReminderRow, VaccinationHistoryRow } from "@/lib/owner-dashboard";
import { VacunaTimelineDot } from "./VacunaTimelineDot";

// ---------------------------------------------------------------------------
// Date formatting for ReminderCard call site
// ---------------------------------------------------------------------------

const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function formatDueAt(d: Date): string {
  return `${d.getDate()} de ${MONTH_NAMES_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

function buildStatusText(daysUntilDue: number): string {
  if (daysUntilDue > 0) {
    return `Vence en ${daysUntilDue} día${daysUntilDue === 1 ? "" : "s"}`;
  }
  if (daysUntilDue === 0) return "Vence hoy";
  const abs = Math.abs(daysUntilDue);
  return `Vencida hace ${abs} día${abs === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Estado de vacunación — 3-badge summary block (spec §5.1)
// ---------------------------------------------------------------------------

function VacunasStatusBadges({ summary }: { summary: VaccinationSummary }) {
  const badges: Array<{
    label: string;
    count: number;
    bg: string;
    border: string;
    text: string;
  }> = [
    {
      label: "Al día",
      count: summary.active,
      bg: "var(--color-ln-ok-050)",
      border: "var(--color-ln-ok-100)",
      text: "var(--color-ln-ok)",
    },
    {
      label: "Por vencer",
      count: summary.dueSoon + summary.missing,
      bg: "var(--color-ln-warn-025)",
      border: "var(--color-ln-warn-050)",
      text: "var(--color-ln-warn)",
    },
    {
      label: "Vencida",
      count: summary.expired,
      bg: "var(--color-ln-err-050)",
      border: "var(--color-ln-err-100)",
      text: "var(--color-ln-seal)",
    },
  ];

  return (
    <section aria-label="Estado de vacunación">
      <p
        className="mb-[8px] font-[var(--font-ln-mono)] text-xs uppercase tracking-[.06em] font-semibold"
        style={{ color: "var(--color-ln-mute)" }}
      >
        Estado de vacunación
      </p>
      <div className="grid grid-cols-3 gap-[8px]">
        {badges.map((b) => (
          <div
            key={b.label}
            className="rounded-[6px] border px-[12px] py-[10px] text-center"
            style={{ background: b.bg, borderColor: b.border }}
          >
            <p
              className="text-[22px] font-semibold leading-tight tabular-nums"
              style={{ color: b.text }}
            >
              {b.count}
            </p>
            <p
              className="mt-[2px] font-[var(--font-ln-mono)] text-xs uppercase tracking-[.05em]"
              style={{ color: b.text }}
            >
              {b.label}
            </p>
          </div>
        ))}
      </div>
      {summary.otherCount > 0 && (
        <p className="mt-[8px] text-[11px]" style={{ color: "var(--color-ln-mute)" }}>
          {summary.otherCount === 1
            ? "1 vacuna registrada fuera del calendario"
            : `${summary.otherCount} vacunas registradas fuera del calendario`}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  petName: string;
  petToken: string;
  upcomingReminders: ActiveReminderRow[];
  history: VaccinationHistoryRow[];
  vaccinationSummary: VaccinationSummary;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VacunasTimeline({
  petName,
  petToken,
  upcomingReminders,
  history,
  vaccinationSummary,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Block 0 — Estado de vacunación (3 badges) */}
      <VacunasStatusBadges summary={vaccinationSummary} />
      {/* Panel 1 — Próximas (only when there are active reminders) */}
      {upcomingReminders.length > 0 && (
        <LnCard aria-labelledby="proximas-vacunas-heading">
          <LnCardHead
            title={<span id="proximas-vacunas-heading">Próximas vacunas</span>}
            actions={
              <Link
                href={`/mis-mascotas/${petToken}/vacunas/programar`}
                className="text-sm text-[var(--color-ln-azul)] underline-offset-4 hover:underline"
              >
                + Programar
              </Link>
            }
          />
          <LnCardBody>
            <ul className="grid gap-3">
              {upcomingReminders.map((r) => (
                <li key={r.reminderId}>
                  <ReminderCard
                    variant={r.variant}
                    title={r.title}
                    petName={petName}
                    statusText={buildStatusText(r.daysUntilDue)}
                    dueAt={`Vence el ${formatDueAt(r.dueAt)}`}
                  />
                </li>
              ))}
            </ul>
          </LnCardBody>
        </LnCard>
      )}

      {/* Panel 2 — Histórico (always shown) */}
      <LnCard aria-labelledby="historico-vacunas-heading">
        <LnCardHead title={<span id="historico-vacunas-heading">Histórico</span>} />
        <LnCardBody>
          {history.length === 0 ? (
            <LnEmptyState
              title="Sin vacunas registradas"
              description="Cuando registres una vacuna acá vas a ver el histórico completo."
              action={
                <Link
                  href={`/mis-mascotas/${petToken}/vacunas/programar`}
                  className="inline-block px-4 py-2 rounded-[3px] bg-[var(--color-ln-azul)] text-white text-sm font-medium hover:bg-[var(--color-ln-azul-700)] transition-colors"
                >
                  Programar vacuna
                </Link>
              }
            />
          ) : (
            <ol className="space-y-0">
              {history.map((v, i) => (
                <VacunaTimelineDot
                  key={v.eventId}
                  recordedAt={v.recordedAt}
                  vaccineName={v.vaccineName}
                  brand={v.brand}
                  batch={v.batch}
                  administeredBy={v.administeredBy}
                  nextDueAt={v.nextDueAt}
                  isFirst={i === 0}
                  isLast={i === history.length - 1}
                  confidenceTier={computeConfidence({
                    authorRole: v.authorRole,
                    authorVerified: v.authorVerified,
                    authorOrganizationId: v.authorOrganizationId,
                    payload: {},
                  })}
                />
              ))}
            </ol>
          )}
        </LnCardBody>
      </LnCard>
    </div>
  );
}
