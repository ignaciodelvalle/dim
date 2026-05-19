import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { and, eq, isNull } from "drizzle-orm";

import { db, organizations, ownerships, pets, profiles } from "@/db";
import { APPLY_INTENT_COOKIE_NAME, validateApplyIntentToken } from "@/lib/apply-intent";
import { createClient } from "@/lib/supabase/server";

// Gate page for the adoption application form (spec
// adoption-listing-public §8). F4 only sets up the gate; the real form
// lands in F5. The gate runs four checks in order:
//
//   1. Auth — requireUserOrRedirect bounces anonymous visitors to /login
//      with returnTo. Anyone who reaches the body is authenticated.
//   2. Institutional reject — admin/govt accounts are not allowed to
//      apply; we render a clear message + back link.
//   3. Pet listable — re-run the same predicate as queryAdoptionListing.
//      If the pet went off-listing between the CTA click and arrival here
//      (lost, deceased, finalized, paused, in dispute, rabies obs, etc.),
//      we surface a friendly notice instead of letting the form open.
//   4. Apply-intent cookie — if present, verify it and clear it. The
//      cookie is signed against the petToken, so a stolen-from-pet-A
//      cookie does NOT open pet-B's form. Missing cookie is fine for the
//      already-authenticated path; only signed-and-stale tokens fail.
//
// Once all four pass we render the F4 placeholder. F5 swaps the body for
// the real submitAdoptionApplicationAction form.

export const dynamic = "force-dynamic";

export default async function PostularPage({
  params,
}: {
  params: Promise<{ petToken: string }>;
}) {
  const { petToken } = await params;
  const returnTo = `/adoptar/${petToken}/postular`;

  // 1) Auth — pass the postular URL as returnTo so anonymous visitors who
  // landed here (e.g. expired session after the JWT redirect) come back to
  // the right place after login. We don't use requireUserOrRedirect because
  // its default redirect target is /login without returnTo.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?intent=apply&returnTo=${encodeURIComponent(returnTo)}`);
  }

  // 2) Institutional reject — clearer to render a message than to 403.
  const [profile] = await db
    .select({ accountType: profiles.accountType })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (profile?.accountType === "institutional") {
    return <InstitutionalBlocked petToken={petToken} />;
  }

  // 3) Listability — duplicated predicate, see /adoptar/[petToken]/page.tsx
  // and /actions/apply-intent.ts. Living in three places is acceptable while
  // each call site reads a different row shape.
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

  // 4) Apply-intent cookie — optional. Validate + clear if present.
  const cookieStore = await cookies();
  const intentCookie = cookieStore.get(APPLY_INTENT_COOKIE_NAME);
  let intentExpired = false;
  if (intentCookie) {
    const ok = validateApplyIntentToken(petToken, intentCookie.value);
    if (!ok) intentExpired = true;
    cookieStore.delete(APPLY_INTENT_COOKIE_NAME);
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

        <section className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-6 space-y-3">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            Formulario en construcción.
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            El form de postulación (tipo de vivienda, otras mascotas, rutina diaria, notas) se
            habilita en la próxima entrega. La gate de auth y el flujo de intención ya están listos.
          </p>
        </section>
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
