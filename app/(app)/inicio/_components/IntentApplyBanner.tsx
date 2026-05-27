// IntentApplyBanner — surfaces a "continue your adoption application" prompt
// on /inicio when the signed-in user has an unresolved apply-intent cookie.
//
// The cookie is set by startApplyIntentAction (app/actions/apply-intent.ts)
// when an anonymous visitor clicks "Postularme" on /adoptar/[petToken].
// After signup, the user is sent back to /adoptar/[petToken]/postular which
// clears the cookie. If the user navigates to /inicio without completing
// the application, the cookie is still alive and we surface this banner
// so they can resume in one tap.
//
// Trilogy unification handoff §3 PR-024.

import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";

import { dismissApplyIntentAction } from "@/app/actions/apply-intent";
import { attachments, db, organizations, ownerships, pets } from "@/db";
import { APPLY_INTENT_PET_TOKEN_COOKIE_NAME } from "@/lib/apply-intent";
import { petPhotoUrl } from "@/lib/storage";

export async function IntentApplyBanner() {
  const cookieStore = await cookies();
  const petTokenCookie = cookieStore.get(APPLY_INTENT_PET_TOKEN_COOKIE_NAME);
  if (!petTokenCookie?.value) return null;

  const petToken = petTokenCookie.value;

  // Resolve the pet + verify it's still listable. If anything is off (org
  // unverified, pet lost / deceased / not eligible, listing paused) we
  // silently skip the banner — the resume CTA would just frustrate the
  // user. The same predicate is used by startApplyIntentAction and the
  // listing query; duplicated here so each call site stays readable.
  const [row] = await db
    .select({
      pet: pets,
      org: organizations,
      photoPath: attachments.storagePath,
    })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(
      and(
        eq(pets.publicToken, petToken),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  const { pet, org, photoPath } = row;

  const stillListable =
    pet.adoptionListedAt !== null &&
    pet.adoptionListingPausedAt === null &&
    pet.status !== "deceased" &&
    pet.status !== "lost" &&
    pet.adoptionEligible === true &&
    pet.inCustodyDispute !== true &&
    pet.rabiesObservationStatus !== "in_progress" &&
    org.verified;

  if (!stillListable) return null;

  const photoUrl = petPhotoUrl(photoPath);

  return (
    <section
      aria-labelledby="intent-apply-banner-h"
      className="rounded-2xl border border-gob-primary/40 bg-gob-primary/5 p-4 flex items-center gap-3"
      data-section="intent-apply-banner"
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-12 w-12 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div
          className="h-12 w-12 rounded-full bg-gob-surface-alt flex-shrink-0"
          aria-hidden="true"
        />
      )}
      <div className="flex-1 min-w-0">
        <p id="intent-apply-banner-h" className="text-sm font-semibold text-gob-text">
          Continuá tu postulación a {pet.name}
        </p>
        <p className="text-xs text-gob-text-muted">
          {org.displayName} ·{" "}
          <Link
            href={`/adoptar/${pet.publicToken}`}
            className="underline underline-offset-2 hover:text-gob-text"
          >
            Ver ficha
          </Link>
        </p>
      </div>
      <Link
        href={`/adoptar/${pet.publicToken}/postular`}
        className="flex-shrink-0 px-3 py-2 rounded-lg bg-gob-primary text-white text-xs font-semibold hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-primary focus-visible:ring-offset-2"
      >
        Continuar →
      </Link>
      <form action={dismissApplyIntentAction}>
        <button
          type="submit"
          aria-label="Descartar este recordatorio"
          className="flex-shrink-0 w-8 h-8 rounded-full text-gob-text-muted hover:bg-gob-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-primary focus-visible:ring-offset-2"
        >
          ×
        </button>
      </form>
    </section>
  );
}
