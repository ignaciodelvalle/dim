// Use-case: the INVITEE accepts a caretaker invitation.
//
// THE ACTOR HERE IS NOT THE TITULAR. Everywhere else in this module the titular
// acts; here the invitee does, on a row addressed to them by token. That
// asymmetry is why the calling action cannot use `requireTitularAccess` — the
// accepting user holds no ownership row on this pet yet, by definition. It
// authorizes with `requireUserOrRedirect` plus the id-or-email match below,
// exactly as `acceptPetTransferAction` does for the same shape of invitation.
//
// THE ONE TRANSACTION. `insertAcceptGrant` writes the ownership row, the
// `caretaker_designated` event and the grant UPDATE together. Splitting them
// would produce, on a mid-way failure, either a caretaker with access and no
// event (unexplainable in the spine) or an event with no access (a lie in an
// append-only log). Neither is recoverable by a retry.
//
// WHY THIS DOES NOT TRIP THE TITULAR-ONLY FENCE, stated rather than left to be
// rediscovered: `caretaker_designated` IS a member of TITULAR_ONLY_EVENT_TYPES
// (a caretaker must not name a sub-caretaker — deny-list row
// `caretaker-sub-designation`), and the writer that emits it is reached from
// this use-case. It is nevertheless safe here because the actor holds NO
// ownership row on the pet at all — that is what "invitee" means — so the role
// the deny-list protects against cannot possibly be the one acting. The grant
// token, minted by the titular under `requireTitularAccess`, IS the authority.
// The repository method carries an inner-writer suffix so the fence can see the
// exemption in the name instead of an allowlist entry.

import type { CaretakersRepositoryPort } from "./ports";
import type { NewNotification, UseCaseResult } from "./types";

type Deps = {
  repo: CaretakersRepositoryPort;
  now: () => Date;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type AcceptCaretakerGrantInput = {
  grantPublicToken: string;
  callerUserId: string;
  /** The caller's authenticated email, resolved by the action from the session. */
  callerEmail: string;
  /**
   * KEY 2 of the two-key public-contact model. Absent means NOT consented —
   * an unchecked checkbox sends no field, and silence is never consent.
   */
  publicContactConsent?: boolean;
};

export type AcceptCaretakerGrantValue = {
  petPublicToken: string | null;
  petName: string;
};

export async function acceptCaretakerGrant(
  input: AcceptCaretakerGrantInput,
  deps: Deps,
): Promise<UseCaseResult<AcceptCaretakerGrantValue>> {
  const { repo, transaction } = deps;
  const now = deps.now();
  const consent = input.publicContactConsent === true;

  const grant = await repo.findGrantByToken(input.grantPublicToken);
  if (!grant) return { ok: false, error: "Invitación no encontrada." };

  if (grant.grantedByUserId === input.callerUserId) {
    return { ok: false, error: "No podés aceptar tu propia invitación." };
  }

  // Id-or-email match: the invitation may have been addressed to an email with
  // no account, and the account created afterwards through the invite link.
  const matchesId = grant.caretakerUserId !== null && grant.caretakerUserId === input.callerUserId;
  const matchesEmail =
    grant.caretakerEmail.toLowerCase() === (input.callerEmail ?? "").trim().toLowerCase();
  if (!matchesId && !matchesEmail) {
    return { ok: false, error: "Esta invitación no es para tu cuenta." };
  }

  if (grant.status !== "pending") {
    return { ok: false, error: "Esta invitación ya no está disponible." };
  }
  if (grant.endsAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      error: "El período de cuidado ya terminó. Pedile al titular que te invite de nuevo.",
    };
  }

  const pet = await repo.findPetSummaryById(grant.petId);

  try {
    await transaction(async (tx) => {
      // Stale-read guard, the acceptPetTransfer shape: re-read the row under a
      // lock and re-check. Between the read above and this line the titular may
      // have cancelled, or the 7-day cron may have expired it.
      const locked = await repo.findGrantByIdForUpdate(grant.id, tx);
      if (!locked || locked.status !== "pending") {
        throw new Error("Esta invitación ya no está disponible.");
      }

      await repo.insertAcceptGrant(
        {
          grantId: grant.id,
          petId: grant.petId,
          caretakerUserId: input.callerUserId,
          grantPublicToken: grant.publicToken,
          endsAt: grant.endsAt,
          note: grant.note,
          publicContactConsent: consent,
          now,
        },
        tx,
      );
    });
  } catch (err) {
    console.error("[caretakers/accept] accept transaction failed:", err);
    return {
      ok: false,
      error: "No pudimos aceptar la invitación. Volvé a intentarlo en unos minutos.",
    };
  }

  const petName = pet?.name ?? "tu mascota";
  const caretakerName = (await repo.findDisplayName(input.callerUserId)) ?? "Tu cuidador/a";
  const endsAtLabel = formatArDate(grant.endsAt);

  const notifications: NewNotification[] = [
    {
      userId: grant.grantedByUserId,
      notificationType: "caretaker_invitation_accepted",
      severity: "success",
      title: `${caretakerName} aceptó cuidar a ${petName}`,
      body: `El cuidado temporal va hasta el ${endsAtLabel}. Podés finalizarlo cuando quieras.`,
      ctaLabel: "Ver mascota",
      ctaUrl: pet ? `/mis-mascotas/${pet.publicToken}` : "/mis-mascotas",
      relatedPetId: grant.petId,
      category: "custody",
    },
  ];

  return {
    ok: true,
    value: { petPublicToken: pet?.publicToken ?? null, petName },
    notifications,
  };
}

function formatArDate(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
