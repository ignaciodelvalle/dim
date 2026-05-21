// VacunasTimeline — server component composing the vaccine libreta view.
//
// Panel 1 — "Próximas": only shown when there are active reminders.
// Panel 2 — "Histórico": always shown. EmptyState when no history.

import Link from "next/link";

import { EmptyState } from "@/components/poncho/EmptyState";
import { Panel, PanelBody, PanelHeader } from "@/components/poncho/Panel";
import { ReminderCard } from "@/components/poncho/ReminderCard";
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

type Props = {
  petName: string;
  petToken: string;
  upcomingReminders: ActiveReminderRow[];
  history: VaccinationHistoryRow[];
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VacunasTimeline({ petName, petToken, upcomingReminders, history }: Props) {
  return (
    <div className="space-y-6">
      {/* Panel 1 — Próximas (only when there are active reminders) */}
      {upcomingReminders.length > 0 && (
        <Panel aria-labelledby="proximas-vacunas-heading">
          <PanelHeader
            title={<span id="proximas-vacunas-heading">Próximas vacunas</span>}
            actions={
              <Link
                href={`/mis-mascotas/${petToken}/vacunas/programar`}
                className="text-sm text-gob-info underline-offset-4 hover:underline"
              >
                + Programar
              </Link>
            }
          />
          <PanelBody>
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
          </PanelBody>
        </Panel>
      )}

      {/* Panel 2 — Histórico (always shown) */}
      <Panel aria-labelledby="historico-vacunas-heading">
        <PanelHeader title={<span id="historico-vacunas-heading">Histórico</span>} />
        <PanelBody>
          {history.length === 0 ? (
            <EmptyState
              title="Sin vacunas registradas"
              description="Cuando registres una vacuna acá vas a ver el histórico completo."
              action={
                <Link
                  href={`/mis-mascotas/${petToken}/vacunas/programar`}
                  className="inline-block px-4 py-2 rounded-lg bg-gob-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Programar primera vacuna
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
                />
              ))}
            </ol>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
