import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db, organizations, ownerships, petEvents, pets, profiles } from "@/db";
import { APPLY_INTENT_COOKIE_NAME, validateApplyIntentToken } from "@/lib/apply-intent";
import { createClient } from "@/lib/supabase/server";

import { ApplicationForm } from "./ApplicationForm";

// Gate page for the adoption application form (spec
// adoption-listing-public §8 + Fase 5). Five checks run in order:
//
//   1. Auth — anonymous → redirect to /login with returnTo so the loop
//      survives expired sessions.
//   2. Institutional reject — admin/govt cannot adopt; render a clear
//      message instead of a 403.
//   3. Listability — same predicate as queryAdoptionListing / ficha page /
//      startApplyIntentAction. If the pet went off-listing between CTA
//      and arrival, surface a friendly notice rather than 404'ing.
//   4. Apply-intent cookie — optional. Verify (signed against the
//      petToken so a pet-A cookie can't open pet-B's form), then clear.
//   5. Idempotency — if the applicant already has an unresolved
//      `_submitted` for this pet, render the "ya postulaste" message
//      instead of letting them re-submit. The submit action also blocks
//      double-writes, but checking here gives a clean UX.

export const dynamic = "force-dynamic";

export default async function PostularPage({
  params,
}: {
  params: Promise<{ petToken: string }>;
}) {
  const { petToken } = await params;
  const returnTo = `/adoptar/${petToken}/postular`;

  // 1) Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?intent=apply&returnTo=${encodeURIComponent(returnTo)}`);
  }

  // 2) Institutional reject.
  const [profile] = await db
    .select({ accountType: profiles.accountType, email: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (profile?.accountType === "institutional") {
    return <InstitutionalBlocked petToken={petToken} />;
  }

  // 3) Listability.
  const [row] = await db
    .select({ pet: pets, org: organizations })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
    .where(
      and(
        eq(pets.publicToken, petToken),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!row) notFound();
  const { pet, org } = row;
  const isListable =
    pet.adoptionListedAt !== null &&
    pet.adoptionListingPausedAt === null &&
    pet.status !== "deceased" &&
    pet.status !== "lost" &&
    pet.adoptionEligible === true &&
    pet.inCustodyDispute !== true &&
    pet.rabiesObservationStatus !== "in_progress" &&
    org.verified &&
    (org.orgType === "shelter" || org.orgType === "rescue_network");
  if (!isListable) {
    return <NoLongerAvailable name={pet.name} />;
  }

  // 4) Apply-intent cookie.
  const cookieStore = await cookies();
  const intentCookie = cookieStore.get(APPLY_INTENT_COOKIE_NAME);
  let intentExpired = false;
  if (intentCookie) {
    const ok = validateApplyIntentToken(petToken, intentCookie.value);
    if (!ok) intentExpired = true;
    cookieStore.delete(APPLY_INTENT_COOKIE_NAME);
  }

  // 5) Idempotency — render "ya postulaste" if there's an unresolved
  // _submitted from this applicant for this pet.
  const pending = await db.execute<{ id: string; submitted_at: string }>(sql`
    SELECT e.id::text AS id,
           e.recorded_at AS submitted_at
    FROM ${petEvents} e
    WHERE e.pet_id = ${pet.id}
      AND e.event_type = 'adoption_application_submitted'
      AND e.payload->>'applicant_user_id' = ${user.id}
      AND NOT EXISTS (
        SELECT 1 FROM ${petEvents} d
        WHERE d.pet_id = e.pet_id
          AND d.event_type IN ('adoption_application_approved', 'adoption_application_rejected')
          AND d.payload->>'application_event_id' = e.id::text
      )
    LIMIT 1
  `);
  if (pending.length > 0) {
    return <AlreadyApplied name={pet.name} />;
  }

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <Link
          href={`/adoptar/${petToken}`}
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a la ficha
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Postularte para adoptar a {pet.name}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {org.displayName} recibe tu postulación y te contacta por mail para coordinar.
          </p>
        </header>

        {intentExpired && (
          <output className="block rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm text-amber-900 dark:text-amber-200">
            Tu intención de postulación expiró, pero tu cuenta sigue activa. Podés seguir desde acá
            sin problema.
          </output>
        )}

        <ApplicationForm
          petPublicToken={petToken}
          petName={pet.name}
          applicantEmail={user.email ?? ""}
        />
      </div>
    </main>
  );
}

function InstitutionalBlocked({ petToken }: { petToken: string }) {
  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto px-6 py-20 text-center space-y-4">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Esta cuenta no puede postularse
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Las cuentas institucionales (admin y autoridades sanitarias) no pueden postularse para
          adoptar. Si querés adoptar a título personal, creá una cuenta personal con otro email.
        </p>
        <Link
          href={`/adoptar/${petToken}`}
          className="inline-block px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium"
        >
          Volver a la ficha
        </Link>
      </div>
    </main>
  );
}

function NoLongerAvailable({ name }: { name: string }) {
  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto px-6 py-20 text-center space-y-4">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {name} ya no está disponible
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          La publicación cambió desde que entraste a esta página. Volvé al listado y elegí otra
          mascota.
        </p>
        <Link
          href="/adoptar"
          className="inline-block px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium"
        >
          Ver otras en adopción
        </Link>
      </div>
    </main>
  );
}

function AlreadyApplied({ name }: { name: string }) {
  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto px-6 py-20 text-center space-y-4">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Ya postulaste para {name}
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          El refugio recibió tu postulación y la está revisando. Te van a contactar por email cuando
          tengan novedades.
        </p>
        <Link
          href="/mis-mascotas/postulaciones"
          className="inline-block px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium"
        >
          Ver mis postulaciones
        </Link>
      </div>
    </main>
  );
}
