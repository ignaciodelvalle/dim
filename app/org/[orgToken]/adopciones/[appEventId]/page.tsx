// Adoption-application review detail (spec adoption-listing-public §11).
// Shows the applicant's full payload + identity + history pointers, and
// surfaces approve/reject controls via ReviewButtons (client).
//
// Gated on `adoption.review` for the org. notFound() if the application
// doesn't belong to a pet in shelter_custody of this org — same shape as
// queryAdoptionListing's organizationToken filter.

import { and, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db, organizations, ownerships, petEvents, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { requireCapability } from "@/lib/capabilities";

import { ReviewButtons } from "./ReviewButtons";

export const dynamic = "force-dynamic";

export default async function AdoptionReviewDetailPage({
  params,
}: {
  params: Promise<{ orgToken: string; appEventId: string }>;
}) {
  const { orgToken, appEventId } = await params;
  const { organization: orgFromToken } = await requireOrgAccessByToken(orgToken);
  const auth = await requireCapability("adoption.review", orgFromToken.id);
  if (auth.error !== null) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
        <div className="max-w-2xl mx-auto pt-8 space-y-4">
          <h1 className="text-2xl font-semibold">Sin acceso</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{auth.error}</p>
          <Link href={`/org/${orgToken}`} className="text-sm text-neutral-600 underline">
            ← Volver al panel
          </Link>
        </div>
      </main>
    );
  }
  const { organization } = auth;

  const [row] = await db
    .select({
      application: petEvents,
      pet: pets,
      org: organizations,
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
    .where(
      and(
        eq(petEvents.id, appEventId),
        eq(petEvents.eventType, "adoption_application_submitted"),
        eq(ownerships.ownerOrganizationId, organization.id),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!row) notFound();
  const { application, pet } = row;

  const payload = application.payload as {
    applicant_user_id: string;
    housing_type: string;
    other_pets: string | null;
    daily_routine: string | null;
    notes: string | null;
  };

  // Applicant identity. profiles.id may not be FK-backed via auth.users
  // (stub profiles exist) but for an actual application the submitter is
  // always a real auth user.
  const [applicant] = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      phone: profiles.phone,
    })
    .from(profiles)
    .where(eq(profiles.id, payload.applicant_user_id))
    .limit(1);

  // Has this application already been resolved? If so we hide the action
  // controls and show the decision summary.
  const decision = await db.execute<{
    outcome: string;
    reviewer_user_id: string;
    notes: string | null;
    auto_generated: string | null;
    decided_at: string;
  }>(sql`
    SELECT payload->>'outcome' AS outcome,
           payload->>'reviewer_user_id' AS reviewer_user_id,
           payload->>'notes' AS notes,
           payload->>'auto_generated' AS auto_generated,
           recorded_at::text AS decided_at
    FROM pet_events
    WHERE pet_id = ${pet.id}
      AND event_type = 'adoption_application_resolved'
      AND payload->>'application_event_id' = ${appEventId}
    ORDER BY recorded_at DESC
    LIMIT 1
  `);
  const finalized = await db.execute<{ id: string }>(sql`
    SELECT id FROM pet_events
    WHERE pet_id = ${pet.id} AND event_type = 'adoption_finalized'
    LIMIT 1
  `);
  const alreadyResolved = decision.length > 0;
  const petAlreadyFinalized = finalized.length > 0;

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href={`/org/${orgToken}/adopciones`}
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a postulaciones
        </Link>

        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Postulación para {pet.name}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Recibida el {new Date(application.recordedAt).toLocaleString("es-AR")}
          </p>
        </header>

        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            Postulante
          </h2>
          <dl className="space-y-1 text-sm">
            <Row label="Nombre" value={applicant?.displayName ?? "(perfil no encontrado)"} />
            {applicant?.phone && <Row label="Teléfono" value={applicant.phone} />}
            <Row label="Tipo de vivienda" value={housingTypeLabel(payload.housing_type)} />
          </dl>
        </section>

        {(payload.other_pets || payload.daily_routine || payload.notes) && (
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              Lo que nos contó
            </h2>
            {payload.other_pets && <Block label="Otras mascotas" body={payload.other_pets} />}
            {payload.daily_routine && <Block label="Día a día" body={payload.daily_routine} />}
            {payload.notes && <Block label="Notas" body={payload.notes} />}
          </section>
        )}

        {alreadyResolved ? (
          <section className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-4 space-y-2">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              Esta postulación ya fue resuelta:{" "}
              {decision[0].outcome === "approved"
                ? "aprobada"
                : decision[0].auto_generated === "true"
                  ? "cerrada automáticamente (otra adopción se finalizó)"
                  : "rechazada"}
              .
            </p>
            <p className="text-xs text-neutral-500">
              {new Date(decision[0].decided_at).toLocaleString("es-AR")}
              {decision[0].notes && ` · ${decision[0].notes}`}
            </p>
          </section>
        ) : petAlreadyFinalized ? (
          <section className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              {pet.name} ya fue adoptado/a. No se pueden revisar más postulaciones para esta
              mascota.
            </p>
          </section>
        ) : (
          <ReviewButtons
            orgToken={orgToken}
            applicationEventId={appEventId}
            applicantName={applicant?.displayName ?? "el postulante"}
          />
        )}

        <p className="text-xs text-neutral-500">
          <Link href={`/org/${orgToken}/mascotas/${pet.publicToken}`} className="underline">
            Ver ficha de {pet.name}
          </Link>
        </p>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-xs text-neutral-500 w-32">{label}</dt>
      <dd className="text-sm text-neutral-900 dark:text-neutral-50">{value}</dd>
    </div>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{body}</p>
    </div>
  );
}

function housingTypeLabel(value: string): string {
  switch (value) {
    case "casa_con_patio":
      return "Casa con patio";
    case "casa_sin_patio":
      return "Casa sin patio";
    case "departamento":
      return "Departamento";
    default:
      return "Otra";
  }
}
