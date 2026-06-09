// Vaccine reminder surface scoped to a single pet — rendered on the pet detail page.
// Renders nothing when there are no active reminders for this pet.

import Link from "next/link";

import { deleteVaccineReminderAction } from "@/app/actions/reminders";
import { ReminderCard } from "@/components/ReminderCard";
import { Panel, PanelBody, PanelHeader } from "@/components/poncho/Panel";
import type { ActiveReminderRow } from "@/lib/owner-dashboard";

// ---------------------------------------------------------------------------
// Date formatting helpers — Spanish, no date-fns dependency.
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

function formatDueAt(dueAt: Date): string {
  const d = dueAt.getDate();
  const m = MONTH_NAMES_ES[dueAt.getMonth()];
  const y = dueAt.getFullYear();
  return `${d} de ${m} de ${y}`;
}

function buildStatusText(daysUntilDue: number): string {
  if (daysUntilDue > 0) {
    return `Vence en ${daysUntilDue} día${daysUntilDue === 1 ? "" : "s"}`;
  }
  if (daysUntilDue === 0) {
    return "Vence hoy";
  }
  const abs = Math.abs(daysUntilDue);
  return `Vencida hace ${abs} día${abs === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PetReminders({
  reminders,
  petToken,
}: {
  reminders: ActiveReminderRow[];
  petToken: string;
}) {
  if (reminders.length === 0) return null;

  return (
    <Panel aria-labelledby="pet-reminders-heading">
      <PanelHeader
        title={<span id="pet-reminders-heading">Próximas vacunas</span>}
        actions={
          <div className="flex items-center gap-3 text-sm">
            <Link
              href={`/mis-mascotas/${petToken}/vacunas/programar`}
              className="text-[var(--color-ln-azul)] underline-offset-4 hover:underline"
            >
              + Programar
            </Link>
            <Link
              href={`/mis-mascotas/${petToken}?tab=vacunas`}
              className="text-[var(--color-ln-azul)] underline-offset-4 hover:underline"
            >
              Ver libreta →
            </Link>
          </div>
        }
      />
      <PanelBody>
        <ul className="grid gap-3">
          {reminders.map((r) => (
            <li key={r.reminderId}>
              <ReminderCard
                variant={r.variant}
                title={r.title}
                petName={r.petName}
                statusText={buildStatusText(r.daysUntilDue)}
                dueAt={`Vence el ${formatDueAt(r.dueAt)}`}
                actions={
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/mis-mascotas/${petToken}/eventos/nuevo/vacuna?reminderId=${r.reminderId}`}
                      className="px-3 py-1.5 rounded-[3px] bg-[var(--color-ln-azul)] text-white text-xs font-medium hover:bg-[var(--color-ln-azul-700)] transition-colors"
                    >
                      Registrar
                    </Link>
                    <form action={deleteVaccineReminderAction.bind(null, petToken, r.reminderId)}>
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-[3px] border border-[var(--color-ln-line)] text-[var(--color-ln-ink-2)] text-xs font-medium hover:bg-[var(--color-ln-stripe)] transition-colors"
                      >
                        Eliminar
                      </button>
                    </form>
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  );
}
