// Use-case: register a new pet.
//
// Receives pre-resolved inputs (canonical jurisdiction, normalized chip,
// ppp flag, upload result) from the thin action layer.
// Orchestrates:
//   1. Generate public token
//   2. Atomic transaction (via repo.insertPetRegistered)
//   3. Collect post-tx best-effort notifications
//   4. Return UseCaseResult<{ petId; eventId }> + notifications[]
//
// NOT handled here (stays in the action):
//   - supabase.auth.getUser() — auth guard
//   - parsePetForm — form parsing
//   - jurisdiction canonicalization (pre-tx I/O)
//   - validateMicrochipId — chip format validation
//   - lookupByChip + chip cross-check (redirect/warn — request-edge)
//   - uploadAttachmentIfPresent — storage upload
//   - isPotentiallyDangerousBreedForJurisdiction — PPP eval
//   - Storage cleanup on error (action holds the supabase client)
//   - Flushing pendingNotifications (post-tx, best-effort)
//   - redirect("/mis-mascotas")

import type { NewNotification, RegisterPetInput, UseCaseResult } from "../domain/types";
import type { PetsRepository } from "../infrastructure/pets-repository";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Actor = {
  user: { id: string };
};

type Deps = {
  repo: typeof PetsRepository;
  actor: Actor;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function registerPet(
  input: RegisterPetInput,
  deps: Deps,
): Promise<
  UseCaseResult<{
    petId: string;
    eventId: string;
    publicToken: string;
    /** True when a double-submit was detected — the pet was NOT created again. */
    wasDuplicate: boolean;
  }>
> {
  const { repo, actor, transaction } = deps;
  const { user } = actor;
  const {
    parsed,
    potentiallyDangerousBreed,
    uploadedPath,
    uploadMimeType,
    uploadSize,
    clientIdempotencyKey,
  } = input;

  const now = new Date();

  // 1. Generate unique public token (pre-tx, advisory-check + retry loop inside repo).
  const publicToken = await repo.generatePublicToken();

  const pendingNotifications: NewNotification[] = [];
  let petId = "";
  let eventId = "";
  // Resolves to the existing pet's token when a double-submit is detected.
  let resolvedPublicToken = publicToken;
  let wasDuplicate = false;

  // 2. Atomic transaction.
  try {
    await transaction(async (tx) => {
      // Double-submit idempotency guard (audit §6): the wizard posts a stable
      // clientIdempotencyKey per form session. An advisory lock + lookup inside
      // the tx makes a second same-key submit see the first one's committed pet
      // instead of creating a duplicate. Mirrors create-intake.ts.
      if (clientIdempotencyKey) {
        const existing = await repo.findDuplicateRegistration(
          clientIdempotencyKey,
          tx as Parameters<typeof repo.findDuplicateRegistration>[1],
        );
        if (existing) {
          wasDuplicate = true;
          resolvedPublicToken = existing.publicToken;
          return;
        }
      }

      const result = await repo.insertPetRegistered(
        {
          publicToken,
          parsed,
          potentiallyDangerousBreed,
          uploadedPath,
          uploadMimeType,
          uploadSize,
          userId: user.id,
          now,
          clientIdempotencyKey,
        },
        tx as Parameters<typeof repo.insertPetRegistered>[1],
      );
      petId = result.petId;
      eventId = result.eventId;

      // PPP notification queued inside tx so relatedPetId is available.
      // Suppressed for foster_in_transit — legal obligation belongs to owner.
      if (potentiallyDangerousBreed && parsed.custodyKind !== "foster_in_transit") {
        pendingNotifications.push({
          userId: user.id,
          notificationType: "ppp_registration_reminder",
          title: `${parsed.name}: registrá tu PPP en el provincial`,
          body: `Tu mascota está marcada como raza potencialmente peligrosa por ${parsed.breed ?? "su raza"}. La Ley CABA 4078 / Ley Provincial 14.107 requiere que la inscribas en el registro provincial correspondiente. MiMAR la marcó automáticamente con la flag oficial.`,
          severity: "warning",
          ctaLabel: "Más info sobre PPP",
          ctaUrl: "https://www.argentina.gob.ar/justicia/derechofacil/leysimple/maltrato-animales",
          relatedPetId: petId,
          relatedEventId: eventId,
        });
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo crear la mascota: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return {
    ok: true,
    value: { petId, eventId, publicToken: resolvedPublicToken, wasDuplicate },
    notifications: pendingNotifications,
  };
}
