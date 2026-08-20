// Use-case: updateLostLastSeen
//
// Backs the "ACTUALIZAR" affordance on LostCaseBlock's "Última vez visto"
// card, reached via /mis-mascotas/{token}/perdida while status='lost'.
//
// AGENTS.md invariant 1 (append-only): a lost→lost status_changed is not a
// real state transition, so this must NOT call setPetLostWriter again (it
// already guards that path with "ya perdida"). Instead it emits a NEW
// owner-authored note_added(kind="sighting") event scoped to the currently
// open lost_pet_episode case — the exact shape reportPetSighting already
// emits for anonymous finders (src/modules/pets/application/sighting/
// report-pet-sighting.ts). Reusing that shape means the update shows up in
// LostScanFeed and counts toward LostEpisode.sightingsCount for free
// (lib/infra/lost-mode.ts derives both from note_added rows scoped by
// caseId with payload->>'kind' = 'sighting') instead of inventing a new
// event kind or a fake status transition.
//
// The ORIGINAL status_changed event is intentionally left untouched — it is
// the immutable record of when the pet was first marked lost. The update is
// a new fact layered on top, not a correction of that record. The read model
// (fetchLostEpisodeForPet, lib/infra/lost-mode.ts) overlays the LATEST
// owner-authored update onto the episode's placeName/coords/lastSeenAt, so
// the profile reflects what the owner typed here without mutating the spine.
// `locationDescription` is carried as its own payload field
// (location_description) because `text` composes address + note for the
// feed and can't be split back apart reliably.
//
// Guard: returns an error (no write) when there is no OPEN lost_pet_episode
// case for the pet. The page only renders this flow when
// fetchLostEpisodeForPet returned non-null, but the case may have
// auto-closed (ADR-18 stale-episode cron) between render and submit, so the
// use-case re-checks server-side rather than trusting the caller.

import { validateEventPayload } from "@/lib/events/event-schemas";
import { findOpenCaseForPetAndKind } from "@/lib/infra/case-helpers";

import type { EventsRepository } from "../../infrastructure/events-repository";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UpdateLostLastSeenParams = {
  petId: string;
  petStatus: string;
  recordedByUserId: string;
  eventAuthorship: {
    authorRole: string;
    authorOrganizationId: string | null;
    authorVerified: boolean;
  };
  /** Free-text update from the owner (address/reference + any note). */
  text: string | null;
  /** The address/reference alone — overlaid as placeName by the read model. */
  locationDescription: string | null;
  locationLat: string | null;
  locationLng: string | null;
  clientIdempotencyKey: string | null;
  now?: Date;
};

export type UpdateLostLastSeenResult = { error: string | null };

type Deps = {
  repo: Pick<EventsRepository, "insertEventIdempotent">;
  /** Injected for tests; defaults to the real case-helpers lookup. */
  findOpenCase?: typeof findOpenCaseForPetAndKind;
  /**
   * P4 item 3 (2026-07-08): this use-case used to call repo.insertEventIdempotent
   * with no executor (defaulting to the bare `db`), so insertEventIdempotent's
   * advisory lock (tx-scoped) would acquire-and-release inside its own
   * auto-committed statement instead of holding across the insert. Wrapping in
   * a transaction — same `transaction` dep shape every sibling lifecycle/medical
   * use-case already takes — closes that.
   */
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

const FALLBACK_TEXT = "El dueño actualizó la última ubicación conocida.";

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function updateLostLastSeen(
  params: UpdateLostLastSeenParams,
  deps: Deps,
): Promise<UpdateLostLastSeenResult> {
  const {
    petId,
    petStatus,
    recordedByUserId,
    eventAuthorship,
    text,
    locationDescription,
    locationLat,
    locationLng,
    clientIdempotencyKey,
    now = new Date(),
  } = params;

  if (petStatus !== "lost") {
    return { error: "Esta mascota no está marcada como perdida." };
  }

  const findOpenCase = deps.findOpenCase ?? findOpenCaseForPetAndKind;
  const lostCase = await findOpenCase(petId, "lost_pet_episode");
  if (!lostCase) {
    return {
      error:
        "La búsqueda de esta mascota ya no está activa. Volvé al perfil para reactivarla o marcarla encontrada.",
    };
  }

  const noteText = text?.trim() || FALLBACK_TEXT;

  const payload = validateEventPayload("note_added", {
    category: "otro",
    text: noteText,
    kind: "sighting",
    location_description: locationDescription?.trim() || null,
  });

  await deps.transaction((tx) =>
    deps.repo.insertEventIdempotent(
      {
        petId,
        eventType: "note_added",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId,
        ...eventAuthorship,
        payload,
        locationLat,
        locationLng,
        caseId: lostCase.id,
        clientIdempotencyKey,
      } as Parameters<typeof deps.repo.insertEventIdempotent>[0],
      tx as Parameters<typeof deps.repo.insertEventIdempotent>[1],
    ),
  );

  return { error: null };
}
