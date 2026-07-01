// get-vacunas-tab-data.ts — use-case for the Vacunas tab panel.
// Auth guard is handled by the shim (app/actions/pet-tab-data.ts).

import type { Organization, Pet } from "@/db";
import {
  fetchActiveRemindersForPet,
  fetchVaccinationHistory,
} from "@/lib/analytics/owner-dashboard";
import { computeVaccinationSummary } from "@/lib/libreta-health-status";
import type { VacunasTabData } from "./types";

export async function getVacunasTabData(context: {
  user: { id: string };
  pet: Pet;
  accessPath: "owner" | "org";
  organization: Organization | null;
}): Promise<{ ok: true; data: VacunasTabData } | { ok: false; error: string }> {
  const { user, pet, accessPath, organization } = context;

  const [upcomingReminders, history] = await Promise.all([
    accessPath === "owner" ? fetchActiveRemindersForPet(user.id, pet.id) : Promise.resolve([]),
    fetchVaccinationHistory(pet.id),
  ]);

  // Derive the vaccination summary from history rows. We map recordedAt as
  // occurredAt because the libreta-health-status helper only needs a Date to
  // compute nextDueAt from intervalMonths — the date of the last dose is the
  // same field regardless of label.
  const historyAsEvents = history.map((r) => ({
    eventType: "vaccination_administered" as const,
    occurredAt: r.recordedAt,
    payload: {
      vaccine_name: r.vaccineName,
      next_due_at: r.nextDueAt ?? null,
    },
  }));
  const vaccinationSummary = computeVaccinationSummary(historyAsEvents, pet.species);

  return {
    ok: true,
    data: {
      petName: pet.name,
      petToken: pet.publicToken,
      petSpecies: pet.species,
      upcomingReminders,
      history,
      vaccinationSummary,
      accessPath,
      organizationDisplayName: organization?.displayName ?? null,
    },
  };
}
