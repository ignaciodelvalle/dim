// /mis-mascotas/[publicToken]/vacunas — vaccine libreta page.
//
// Access: mirrors the pet detail page pattern.
//   - owner path: full view with active reminders + history.
//   - org path: read-only — reminders omitted (they're user-scoped), history shown.
//   - no access: notFound().
//
// Data: fetchActiveRemindersForPet (owner only) + fetchVaccinationHistory (both paths).

import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchActiveRemindersForPet, fetchVaccinationHistory } from "@/lib/owner-dashboard";
import { requirePetAccess } from "@/lib/pet-access";
import { VacunasTimeline } from "./VacunasTimeline";

export default async function VacunasLibretaPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();

  const { user, pet, accessPath } = access;

  const [upcomingReminders, history] = await Promise.all([
    // Active reminders are user-scoped (reminder.user_id). Org vets don't own
    // reminders so we skip the query on the org path to avoid an empty result
    // that could imply "no reminders" for what is actually a permissions gap.
    accessPath === "owner" ? fetchActiveRemindersForPet(user.id, pet.id) : Promise.resolve([]),
    fetchVaccinationHistory(pet.id),
  ]);

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-3xl mx-auto pt-6 pb-10 space-y-6">
        {/* Back link */}
        <Link
          href={`/mis-mascotas/${publicToken}`}
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Volver a {pet.name}
        </Link>

        {/* Org-access notice */}
        {accessPath === "org" && access.organization && (
          <div className="rounded border border-gob-info bg-gob-info/10 px-3 py-2 text-sm text-gob-azul-link   ">
            Estás viendo la libreta de {pet.name} como miembro de{" "}
            <strong>{access.organization.displayName}</strong>. Vista de solo lectura.
          </div>
        )}

        {/* Header */}
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-gob-text ">
            Libreta de vacunas — {pet.name}
          </h1>
          <p className="text-sm text-gob-text-gray  mt-1">
            Historial completo de vacunaciones y próximos vencimientos.
          </p>
        </header>

        {/* Main content */}
        <VacunasTimeline
          petName={pet.name}
          petToken={publicToken}
          upcomingReminders={upcomingReminders}
          history={history}
        />
      </div>
    </main>
  );
}
