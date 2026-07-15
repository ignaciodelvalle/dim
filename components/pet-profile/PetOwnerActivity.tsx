// PetOwnerActivity — the pet's own reminders, turnos, and open cycles,
// rendered INSIDE its profile (owner-ia-redesign P3, "the profile absorbs its
// pet's content"). Owner-only: the pet profile page gates this on the owner
// access path, so org/public/vet viewers of the same route never see it.
//
// Pet-scoped by construction — the RSC feeds it data from the SAME fetchers
// /inicio uses (fetchActiveRemindersForPet / fetchUpcomingAppointments /
// fetchOpenWorkflows), each filtered to this pet. `/inicio` still renders the
// cross-pet versions this phase (transitional duplication is deliberate;
// removal is P5's gate).

import { RemindersSection } from "@/app/(app)/inicio/_components/RemindersSection";
import { CasesWidget, adaptWorkflow } from "@/components/CasesWidget";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import type {
  ActiveReminderRow,
  UpcomingAppointment,
  WorkflowItem,
} from "@/lib/analytics/owner-dashboard";
import { AR_TIME_ZONE } from "@/lib/utils/format";
import Link from "next/link";

const MONTH_ABBR = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
];

function ApptRow({
  date,
  title,
  meta,
  token,
}: { date: Date; title: string; meta: string; token: string }) {
  return (
    <Link
      href={`/mis-turnos/${token}`}
      className="flex items-center gap-3 rounded-[var(--radius-sm)] hover:bg-[var(--color-ln-stripe)] transition-colors no-underline -mx-1.5 px-1.5 py-1"
    >
      <div className="flex h-[44px] w-[44px] flex-shrink-0 flex-col items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] text-center">
        <span className="font-[var(--font-ln-mono)] text-[var(--text-xs)] uppercase tracking-[.06em] text-[var(--color-ln-mute)]">
          {MONTH_ABBR[date.getMonth()]}
        </span>
        <span className="font-[var(--font-ln-serif)] text-base font-semibold leading-tight text-[var(--color-ln-ink)]">
          {date.getDate()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[var(--text-md)] font-medium text-[var(--color-ln-ink)]">{title}</p>
        <p className="font-[var(--font-ln-mono)] text-[var(--text-sm)] text-[var(--color-ln-mute)]">
          {meta}
        </p>
      </div>
    </Link>
  );
}

type Props = {
  reminders: ActiveReminderRow[];
  appointments: UpcomingAppointment[];
  workflows: WorkflowItem[];
};

export function PetOwnerActivity({ reminders, appointments, workflows }: Props) {
  const hasAny = reminders.length > 0 || appointments.length > 0 || workflows.length > 0;
  // Nothing to show → render nothing (no empty cards cluttering a healthy pet).
  if (!hasAny) return null;

  return (
    <div data-section="pet-owner-activity" className="mt-6 flex flex-col gap-5">
      {/* Recordatorios — reuses /inicio's section (null when empty). */}
      <RemindersSection reminders={reminders} />

      {/* Próximos turnos — this pet's confirmed appointments. */}
      {appointments.length > 0 && (
        <LnCard>
          <LnCardHead title="Próximos turnos" label="agenda" />
          <LnCardBody>
            <div className="flex flex-col gap-2.5">
              {appointments.map(({ appointment, slot, offering }) => (
                <ApptRow
                  key={appointment.publicToken}
                  token={appointment.publicToken}
                  date={new Date(slot.startsAt)}
                  title={offering.displayName}
                  meta={new Date(slot.startsAt).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    // Pin to ART — the server renders in UTC on Vercel.
                    timeZone: AR_TIME_ZONE,
                  })}
                />
              ))}
            </div>
          </LnCardBody>
        </LnCard>
      )}

      {/* Ciclos abiertos — this pet's open workflows/cases. */}
      {workflows.length > 0 && (
        <CasesWidget cases={workflows.map(adaptWorkflow)} title="Ciclos abiertos" />
      )}
    </div>
  );
}
