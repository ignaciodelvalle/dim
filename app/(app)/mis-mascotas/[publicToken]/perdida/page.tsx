// Marcar como perdida / Actualizar última ubicación — Libreta Nacional redesign.
//
// Two flows share this route depending on pet.status:
//   - status !== 'lost' (and !== 'deceased'): first-time MarkLostWizard.
//   - status === 'lost' WITH an open lost_pet_episode case: UpdateLastSeenForm
//     — the "ACTUALIZAR" affordance on LostCaseBlock's "Última vez visto" card
//     links here. This does NOT redirect away: doing so unconditionally for
//     status='lost' was a regression that turned "ACTUALIZAR" into a dead end
//     (it always bounced back to the profile it was launched from).
//   - status === 'lost' WITHOUT an open case: the episode auto-closed for
//     inactivity (ADR-18 stale cron) but pets.status is still 'lost'. The
//     profile's StaleLostCaseBanner already offers "Reactivar búsqueda" /
//     "Marcar encontrada" for this state, so redirecting there is correct —
//     there's nothing for this route to update.
//   - status === 'deceased': unchanged — always redirect to the profile.

import Link from "next/link";
import { redirect } from "next/navigation";

import { fetchLostEpisodeForPet } from "@/lib/infra/lost-mode";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { requireOwnedPetByToken } from "@/lib/infra/pets";
import { setPetLostAction, updateLostLastSeenAction } from "@/src/modules/events/actions";
import { MarkLostWizard } from "./MarkLostWizard";
import { UpdateLastSeenForm } from "./UpdateLastSeenForm";

export default async function MarkPetLostPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  if (pet.status === "deceased") {
    redirect(`/mis-mascotas/${publicToken}`);
  }

  if (pet.status === "lost") {
    const episode = await fetchLostEpisodeForPet(pet.id);
    if (!episode) {
      // Stale (auto-closed) episode — nothing to update here; the profile's
      // StaleLostCaseBanner is the correct next step.
      redirect(`/mis-mascotas/${pet.publicToken}`);
    }

    const updateAction = updateLostLastSeenAction.bind(null, pet.publicToken);

    return (
      <div className="mx-auto max-w-md px-8 py-7 pb-12">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="mb-5 inline-block font-[var(--font-ln-mono)] text-[var(--text-sm)] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          ← {pet.name}
        </Link>

        <UpdateLastSeenForm
          action={updateAction}
          petName={pet.name}
          petJurisdictionProvince={pet.jurisdictionProvince ?? null}
          petJurisdictionLocality={pet.jurisdictionLocality ?? null}
          defaultPlaceName={episode.placeName}
          defaultNote={episode.ownerNote}
          defaultLat={episode.lastSeenLat != null ? Number(episode.lastSeenLat) : null}
          defaultLng={episode.lastSeenLng != null ? Number(episode.lastSeenLng) : null}
        />
      </div>
    );
  }

  const boundAction = setPetLostAction.bind(null, pet.publicToken);
  const canonicalIds = await fetchActiveIdentifications(pet.id);

  const disclosureDefaults = {
    discloseFirstNameWhenLost: pet.discloseFirstNameWhenLost,
    disclosePhoneWhenLost: pet.disclosePhoneWhenLost,
    discloseEmailWhenLost: pet.discloseEmailWhenLost,
    discloseLastLocationWhenLost: pet.discloseLastLocationWhenLost,
    allowFinderFormWhenLost: pet.allowFinderFormWhenLost,
  };

  return (
    <div className="mx-auto max-w-md px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href={`/mis-mascotas/${pet.publicToken}`}
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← {pet.name}
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Marcar como perdida
        </h1>
        <p className="mt-1.5 text-md text-[var(--color-ln-mute)]">
          Al marcar a {pet.name} como perdida, su credencial pública mostrará la información que
          elijas a continuación. Podés cambiarla en cualquier momento o revertir el estado cuando
          aparezca.
        </p>
      </div>

      <MarkLostWizard
        action={boundAction}
        disclosureDefaults={disclosureDefaults}
        petName={pet.name}
        petPublicToken={pet.publicToken}
        petHasMicrochip={canonicalIds.microchip !== null}
        petHasTattoo={canonicalIds.tattoo !== null}
        petColor={pet.color ?? null}
        petDistinguishingFeatures={pet.distinguishingFeatures ?? null}
        petJurisdictionProvince={pet.jurisdictionProvince ?? null}
        petJurisdictionLocality={pet.jurisdictionLocality ?? null}
      />
    </div>
  );
}
