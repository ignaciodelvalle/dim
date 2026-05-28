import Link from "next/link";

// PetVaccineReminders — overdue + upcoming vaccines for the pet.
//
// Sourced from `reminders` rows where type='vaccine' for this pet,
// filtered to active (deletedAt is null) and ordered by dueAt ascending.
// Overdue rows surface first with a red chip; upcoming within 30 days
// get an amber chip; further-out rows are neutral.

export type VaccineReminder = {
  id: string;
  /** Vaccine common name (Antirrábica, Triple felina, …). */
  name: string;
  /** Subtitle: dose number, "refuerzo anual", etc. */
  subtitle?: string;
  /** When it's due. Component computes overdue / soon / future. */
  dueAt: Date;
};

const DAY = 24 * 60 * 60 * 1000;
const SOON_DAYS = 30;

interface Props {
  reminders: VaccineReminder[];
  /** Page that lists all vaccines for this pet. */
  vaccinesHref: string;
  /** Page to book an appointment. Typically /turnos/nuevo?pet={token}&service=vaccine. */
  scheduleHref: (reminder: VaccineReminder) => string;
}

export function PetVaccineReminders({ reminders, vaccinesHref, scheduleHref }: Props) {
  const sorted = [...reminders].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  return (
    <section
      aria-labelledby="pp-vac-h"
      className="rounded-2xl border border-gob-border bg-white p-4  "
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="pp-vac-h" className="text-base font-semibold text-gob-text ">
          Próximas vacunas
        </h2>
        <Link
          href={vaccinesHref}
          className="text-xs font-medium text-gob-azul-link hover:underline"
        >
          Ver todas →
        </Link>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gob-border-strong p-6 text-center text-sm text-gob-text-muted ">
          Sin vacunas pendientes. Buen trabajo.
        </p>
      ) : (
        <ul className="divide-y divide-gob-border ">
          {sorted.map((r) => (
            <ReminderRow key={r.id} reminder={r} href={scheduleHref(r)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReminderRow({ reminder, href }: { reminder: VaccineReminder; href: string }) {
  const now = Date.now();
  const diffDays = Math.round((reminder.dueAt.getTime() - now) / DAY);
  const overdue = diffDays < 0;
  const soon = !overdue && diffDays <= SOON_DAYS;

  const pillClass = overdue
    ? "bg-gob-danger/10 text-gob-danger  "
    : soon
      ? "bg-gob-warning/10 text-gob-warning-text  "
      : "bg-gob-surface-alt text-gob-text-gray  ";

  const pillText = overdue
    ? `vencida hace ${Math.abs(diffDays)} d.`
    : diffDays === 0
      ? "vence hoy"
      : `en ${diffDays} d.`;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <div
        className={`flex w-[58px] shrink-0 flex-col items-center rounded-lg p-1.5 text-center text-[11px] font-medium leading-tight ${pillClass}`}
      >
        <span className="text-sm font-semibold">
          {reminder.dueAt.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}
        </span>
        <span>{pillText}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gob-text ">{reminder.name}</p>
        {reminder.subtitle && <p className="text-xs text-gob-text-muted ">{reminder.subtitle}</p>}
      </div>
      <Link
        href={href}
        className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold ${
          overdue
            ? "bg-gob-primary text-white hover:bg-gob-primary-hover"
            : "text-gob-azul-link hover:underline"
        }`}
      >
        Agendar
      </Link>
    </li>
  );
}
