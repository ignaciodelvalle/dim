import { db, reminders } from "@/db";
import { requireOwnedPetByToken } from "@/lib/pets";
import { createVaccinationAction } from "@/src/modules/events/actions";
import { LnSheetCard, LnSheetWrap } from "@/components/ui/Sheet";
import { and, eq, isNull } from "drizzle-orm";
import { VaccinationForm } from "./VaccinationForm";

export default async function NewVaccinationPage({
  params,
  searchParams,
}: {
  params: Promise<{
    publicToken: string;
    vaccineName?: string;
    occurredAt?: string;
    notes?: string;
  }>;
  searchParams: Promise<{
    reminderId?: string;
    vaccineName?: string;
    occurredAt?: string;
    notes?: string;
  }>;
}) {
  const { publicToken } = await params;
  const sp = await searchParams;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  // If routed from a pending reminder, pre-fill the vaccine name from
  // its title. This is the original prefill path (kept intact).
  let initialVaccineName: string | undefined = sp.vaccineName ?? undefined;
  let validReminderId: string | undefined;
  if (sp.reminderId) {
    const [reminder] = await db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.id, sp.reminderId),
          eq(reminders.petId, pet.id),
          isNull(reminders.completedAt),
        ),
      )
      .limit(1);
    if (reminder) {
      // Reminder title wins over URL slot when both are present.
      initialVaccineName = reminder.title;
      validReminderId = reminder.id;
    }
  }

  // Captura-rápida URL-prefill slots (event-capture-registry).
  const defaults = {
    occurredAt: sp.occurredAt ?? null,
    notes: sp.notes ?? null,
  };

  const boundAction = createVaccinationAction.bind(null, pet.publicToken);

  return (
    <LnSheetWrap>
      <LnSheetCard>
        <VaccinationForm
          action={boundAction}
          species={pet.species}
          initialVaccineName={initialVaccineName}
          sourceReminderId={validReminderId}
          defaults={defaults}
        />
      </LnSheetCard>
    </LnSheetWrap>
  );
}
