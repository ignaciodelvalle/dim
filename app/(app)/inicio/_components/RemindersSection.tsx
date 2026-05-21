// Reminder surface for /inicio — shows actionable vaccine reminders above the fold.
// Renders nothing when there is no actionable load (see threshold logic below).

import { Panel, PanelBody, PanelHeader } from "@/components/poncho/Panel";
import { ReminderCard } from "@/components/poncho/ReminderCard";
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
// Visibility rule (spec §A.2):
//  - 0 reminders → null
//  - >0 reminders BUT no overdue/overdue_critical AND < 3 reminders → null
//  - otherwise → render
// ---------------------------------------------------------------------------

function shouldRender(reminders: ActiveReminderRow[]): boolean {
  if (reminders.length === 0) return false;
  const hasOverdue = reminders.some(
    (r) => r.variant === "overdue" || r.variant === "overdue_critical",
  );
  if (!hasOverdue && reminders.length < 3) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const VISIBLE_COUNT = 3;

export function RemindersSection({
  reminders,
}: {
  reminders: ActiveReminderRow[];
}) {
  if (!shouldRender(reminders)) return null;

  const visible = reminders.slice(0, VISIBLE_COUNT);
  const overflow = reminders.slice(VISIBLE_COUNT);
  const totalCount = reminders.length;

  return (
    <Panel aria-labelledby="reminders-heading">
      <PanelHeader
        title={<span id="reminders-heading">Recordatorios</span>}
        actions={
          <span className="text-sm text-gob-text-gray font-normal">
            {totalCount} {totalCount === 1 ? "recordatorio" : "recordatorios"}
          </span>
        }
      />
      <PanelBody>
        <ul className="grid gap-3">
          {visible.map((r) => (
            <li key={r.reminderId}>
              <ReminderCard
                variant={r.variant}
                title={r.title}
                petName={r.petName}
                statusText={buildStatusText(r.daysUntilDue)}
                dueAt={`Vence el ${formatDueAt(r.dueAt)}`}
                // TODO(C4): wire actions slot with Agendar / Posponer buttons
              />
            </li>
          ))}
        </ul>

        {overflow.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-gob-text-gray hover:text-gob-text select-none">
              Ver {overflow.length} más
            </summary>
            <ul className="grid gap-3 mt-3">
              {overflow.map((r) => (
                <li key={r.reminderId}>
                  <ReminderCard
                    variant={r.variant}
                    title={r.title}
                    petName={r.petName}
                    statusText={buildStatusText(r.daysUntilDue)}
                    dueAt={`Vence el ${formatDueAt(r.dueAt)}`}
                    // TODO(C4): wire actions slot with Agendar / Posponer buttons
                  />
                </li>
              ))}
            </ul>
          </details>
        )}
      </PanelBody>
    </Panel>
  );
}
