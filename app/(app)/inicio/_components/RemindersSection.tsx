// Reminder surface for /inicio — shows actionable vaccine reminders above the fold.
// Two render modes:
//   1 reminder  → inline banner with "Registrar" CTA (matches Pantallas dump line ~17-19)
//   2+         → Panel with header + reminder card list
//   0          → null

import { Panel, PanelBody, PanelHeader } from "@/components/poncho/Panel";
import { ReminderCard } from "@/components/poncho/ReminderCard";
import type { ActiveReminderRow } from "@/lib/owner-dashboard";

import { ReminderActions } from "./ReminderActions";

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
// Banner background tone by variant. Maps to Poncho semantic tokens so the
// banner shifts amber → red as the reminder gets more critical.
// ---------------------------------------------------------------------------

const BANNER_TONE: Record<ActiveReminderRow["variant"], string> = {
  upcoming:
    "bg-[var(--color-ln-celeste-050)] border-[var(--color-ln-azul)] text-[var(--color-ln-ink)]",
  due_soon: "bg-[#fdf2e0] border-[var(--color-ln-warn)] text-[var(--color-ln-ink)]",
  overdue: "bg-[#fbe9e6] border-[var(--color-ln-seal)] text-[var(--color-ln-ink)]",
  overdue_critical: "bg-[#fbe9e6] border-[var(--color-ln-seal)] text-[var(--color-ln-ink)]",
  success: "bg-[#eef6f0] border-[var(--color-ln-ok)] text-[var(--color-ln-ink)]",
};

function ReminderBanner({ reminder }: { reminder: ActiveReminderRow }) {
  const tone = BANNER_TONE[reminder.variant] ?? BANNER_TONE.upcoming;
  return (
    <section
      aria-labelledby="single-reminder-heading"
      className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${tone}`}
    >
      <div className="min-w-0 flex-1">
        <p id="single-reminder-heading" className="text-sm font-semibold">
          {reminder.title} de {reminder.petName}{" "}
          {buildStatusText(reminder.daysUntilDue).toLowerCase()}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-ln-mute)]">
          Vence el {formatDueAt(reminder.dueAt)}
        </p>
      </div>
      <ReminderActions
        reminderId={reminder.reminderId}
        petToken={reminder.petToken}
        title={reminder.title}
        variant="banner"
      />
    </section>
  );
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
  if (reminders.length === 0) return null;

  // Single reminder → inline banner with CTA.
  if (reminders.length === 1) {
    return <ReminderBanner reminder={reminders[0]} />;
  }

  // 2+ reminders → Panel with list.
  const visible = reminders.slice(0, VISIBLE_COUNT);
  const overflow = reminders.slice(VISIBLE_COUNT);
  const totalCount = reminders.length;

  return (
    <Panel aria-labelledby="reminders-heading">
      <PanelHeader
        title={<span id="reminders-heading">Recordatorios</span>}
        actions={
          <span className="text-sm text-[var(--color-ln-ink-2)] font-normal">
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
                actions={
                  <ReminderActions
                    reminderId={r.reminderId}
                    petToken={r.petToken}
                    title={r.title}
                    variant="row"
                  />
                }
              />
            </li>
          ))}
        </ul>

        {overflow.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-[var(--color-ln-ink-2)] hover:text-[var(--color-ln-ink)] select-none">
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
                    actions={
                      <ReminderActions
                        reminderId={r.reminderId}
                        petToken={r.petToken}
                        title={r.title}
                        variant="row"
                      />
                    }
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
