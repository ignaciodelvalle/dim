// Read model: "what is this pet's caretaker situation right now?"
//
// IMPORTED DIRECTLY BY THE PAGE. `app/**` sits outside the module graph, so
// `app/(app)/mis-mascotas/[publicToken]/page.tsx` calling this creates no
// cross-module edge. The tempting shortcut — a `pets` use-case that fetches
// caretaker state — is precisely the import that would invert the dependency
// fence (design H). Do not add one.

import type { CaretakersRepositoryPort } from "./ports";

type Deps = { repo: CaretakersRepositoryPort; now: () => Date };

export type ActiveCaretaker = {
  grantId: string;
  grantPublicToken: string;
  caretakerUserId: string;
  caretakerName: string;
  startsAt: Date;
  endsAt: Date;
  /**
   * KEY 2 of the two-key public-contact model. Non-null means the caretaker
   * consented at accept; the titular's own disclosure toggle is key 1. The
   * toggle must not even RENDER while this is null.
   */
  publicContactConsentAt: Date | null;
};

export type PendingCaretakerInvitation = {
  grantId: string;
  grantPublicToken: string;
  caretakerEmail: string;
  caretakerUserId: string | null;
  startsAt: Date;
  endsAt: Date;
};

export type CaretakerState = {
  active: ActiveCaretaker | null;
  pending: PendingCaretakerInvitation | null;
};

export async function getCaretakerStateForPet(petId: string, deps: Deps): Promise<CaretakerState> {
  const { repo } = deps;
  const now = deps.now();

  const open = await repo.findOpenGrantsForPet(petId);

  // An `accepted` row past its `ends_at` is NOT active. The cron closes those
  // once a day; between `ends_at` and the next 04:00 run the row still says
  // accepted, and RLS (has_titular_write_access) already stopped honouring it.
  // Reporting it as active here would have the cockpit promise an access that
  // the database no longer grants.
  const acceptedRow = open.find(
    (g) => g.status === "accepted" && g.endsAt.getTime() > now.getTime(),
  );
  const pendingRow = open.find((g) => g.status === "pending");

  let active: ActiveCaretaker | null = null;
  if (acceptedRow?.caretakerUserId) {
    active = {
      grantId: acceptedRow.id,
      grantPublicToken: acceptedRow.publicToken,
      caretakerUserId: acceptedRow.caretakerUserId,
      caretakerName: (await repo.findDisplayName(acceptedRow.caretakerUserId)) ?? "Tu cuidador/a",
      startsAt: acceptedRow.startsAt,
      endsAt: acceptedRow.endsAt,
      publicContactConsentAt: acceptedRow.publicContactConsentAt,
    };
  }

  const pending: PendingCaretakerInvitation | null = pendingRow
    ? {
        grantId: pendingRow.id,
        grantPublicToken: pendingRow.publicToken,
        caretakerEmail: pendingRow.caretakerEmail,
        caretakerUserId: pendingRow.caretakerUserId,
        startsAt: pendingRow.startsAt,
        endsAt: pendingRow.endsAt,
      }
    : null;

  return { active, pending };
}
