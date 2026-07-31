// Declared-by-owner chip/esterilización sign-off (#3 — vet-signs keystone
// extension, PO 2026-07-18).
//
// PO model: "el vet lo puede firmar cuando entra la mascota en su sistema; el
// dueño solo carga y va a una vet físicamente." A microchip_implanted or
// sterilization_performed event the OWNER declared (authorRole="owner") has
// no professional signature. This module:
//   - surfaces the pet's most recent still-unsigned declaration of each
//     signable type (fetchPendingDeclaredEvents — read for page.tsx), and
//   - guards the sign-off actions so an already-signed act can never be
//     "re-signed" (rejectIfAlreadySigned — a no-op/rejection, not a crash).
// Both answer the same question with the same predicate; see below for what
// "already signed" means and why the earlier answer was unreachable.
//
// Append-only: rejectIfAlreadySigned only READS. Signing itself is a brand-new
// pet_event insert (same #43 provenance mechanism the vaccine keystone already
// uses via atenderVaccinationAction) — the original declared event is never
// updated or deleted.
//
// ---------------------------------------------------------------------------
// "Already signed" — the question, restated (PO ruling 2026-07-30)
// ---------------------------------------------------------------------------
// The first cut of this module asked the WRONG QUESTION: it selected only
// authorRole="owner" rows and then asked whether that owner row had reached
// professional verification. Under invariant #2 a vet's signature can never
// mutate the owner row — it appends a NEW row with authorRole="vet" — so the
// exit condition was unreachable BY CONSTRUCTION. The card never cleared, and
// every re-signature left a permanent duplicate in a legally-weighted health
// record (verified live 2026-07-30: chip signed at 21:47:06Z, card stayed).
//
// PO ruling: a declaration is "already signed" when a PROFESSIONALLY VERIFIED
// row for THAT ACT exists on the pet. Don't touch the owner row — change the
// question, from "is this row signed?" to "does a professional record of this
// act exist in the libreta?".
//
// Scoping the act (the recurrence risk the PO accepted, handled here). Matching
// on event TYPE alone would silence a genuinely NEW declaration of a repeatable
// act. So each signable type declares its OCCURRENCE IDENTITY:
//   - sterilization_performed — ONE-SHOT. A pet is castrated/spayed once; any
//     professional-verified sterilization on this pet confirms the owner's
//     declaration of it, whatever date the vet recorded.
//   - microchip_implanted — REPEATABLE (chip migrated, unreadable, imported
//     animal). Identity is the concrete artifact: the CHIP NUMBER. A verified
//     row for chip A never silences a fresh declaration of chip B.
//
// Why not persist a reference from the signature to the declaration it
// confirms? Three reasons, in order of weight:
//   1. It is NOT RETROACTIVE. Rows already signed carry no reference, so the
//      card would stay stuck for exactly the pets this bug already hit.
//   2. pet_events has no event→event FK (notifications.related_event_id is a
//      different table); the local idiom would be a payload key, and both
//      payload schemas are z.strict() — a schema version bump + upcaster, well
//      outside a defect fix.
//   3. The chip number is ALREADY in the payload and is a stronger
//      discriminator than a link that only exists going forward.

import { and, desc, eq, inArray } from "drizzle-orm";

import { type EventType, db, petEvents } from "@/db";
import { type ConfidenceTier, computeConfidence, isAtLeast } from "@/lib/events/event-confidence";
import { upcastPayload } from "@/lib/events/event-upcasters";
import type { EventFormState } from "@/src/modules/events/actions";

export type SignableEventType = "microchip_implanted" | "sterilization_performed";

/**
 * How to tell whether two rows of the same signable type describe the SAME act.
 *
 * `recurring: false` — the act happens at most once per pet, so the type IS the
 * identity: any professional-verified row of it confirms any declaration of it.
 *
 * `recurring: true` — the act can legitimately happen again, so a verified row
 * only confirms a declaration whose `occurrenceKey` it shares.
 */
type SignableEventRule = {
  recurring: boolean;
  /** Only consulted when `recurring`. Must be total — never return null. */
  occurrenceKey?: (payload: Record<string, unknown>, occurredAt: Date) => string;
};

const SIGNABLE_EVENT_RULES: Readonly<Record<SignableEventType, SignableEventRule>> = {
  // Repeatable: a pet can be re-chipped (migration, unreadable chip, an import
  // arriving with a foreign chip). The chip number IS the implantation.
  // Fallback to the occurrence date only for a legacy row whose payload carries
  // no chip number — chip_number is required by the current z.strict() schema,
  // so this is a floor for historical data, not a normal path.
  microchip_implanted: {
    recurring: true,
    occurrenceKey: (payload, occurredAt) => {
      const chip = typeof payload.chip_number === "string" ? payload.chip_number.trim() : "";
      return chip !== "" ? `chip:${chip}` : `date:${toDateInputValue(occurredAt)}`;
    },
  },
  // One-shot: castration/ovariectomy is performed once per animal. The vet may
  // correct the date while signing, so date must NOT scope this one.
  sterilization_performed: { recurring: false },
};

const SIGNABLE_EVENT_TYPES: ReadonlySet<SignableEventType> = new Set(
  Object.keys(SIGNABLE_EVENT_RULES) as SignableEventType[],
);

export type PendingDeclaredEvent = {
  id: string;
  eventType: SignableEventType;
  /** Short es-AR label for the card row, e.g. "Microchip 985141004321456". */
  summary: string;
  /** Query-string values the confirm form reads as prefill (AtenderCaptureMounter). */
  prefill: Record<string, string>;
};

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type DeclaredEventRow = {
  id: string;
  petId: string;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
};

type ProvenanceRow = Pick<
  DeclaredEventRow,
  "payload" | "authorRole" | "authorVerified" | "authorOrganizationId"
>;

/** The confidence tier THIS row's own provenance produces. Note that
 * `org_registered` (org member without a validated matrícula) sits
 * deliberately below `professional_verified` — it is a record, not a
 * professional signature. */
function confidenceOf(row: ProvenanceRow): ConfidenceTier {
  return computeConfidence({
    authorRole: row.authorRole,
    authorVerified: row.authorVerified,
    authorOrganizationId: row.authorOrganizationId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
  });
}

/** Identity of the concrete act a row records, or null when the type is
 * one-shot (identity is the type itself). */
function occurrenceKeyOf(row: DeclaredEventRow, eventType: SignableEventType): string | null {
  const rule = SIGNABLE_EVENT_RULES[eventType];
  if (!rule.recurring || !rule.occurrenceKey) return null;
  const payload = (upcastPayload(eventType as EventType, row.payload) ?? {}) as Record<
    string,
    unknown
  >;
  return rule.occurrenceKey(payload, new Date(row.occurredAt));
}

/**
 * THE rule, shared verbatim by the card (fetchPendingDeclaredEvents) and the
 * write guard (rejectIfAlreadySigned) so the two can never disagree.
 *
 * A declaration is signed when the pet's event spine already holds a
 * professionally-verified row of the same type describing the same act. The
 * declaration row itself is included in `petRows`, which subsumes the old
 * self-check: if `declared` is somehow already a verified row, it matches
 * itself and the answer is still "signed".
 */
function isDeclarationSigned(declared: DeclaredEventRow, petRows: DeclaredEventRow[]): boolean {
  return findRecordOfSameAct(declared, petRows, "professional_verified") !== null;
}

/**
 * The first row on the pet that records the SAME ACT as `declared` with
 * confidence at least `minimumTier`, or null. `excludeId` drops one row from
 * the scan — used by the duplicate guard so the declaration cannot match
 * itself (see rejectIfAlreadySigned).
 */
function findRecordOfSameAct(
  declared: DeclaredEventRow,
  petRows: DeclaredEventRow[],
  minimumTier: ConfidenceTier,
  excludeId?: string,
): DeclaredEventRow | null {
  const eventType = declared.eventType as SignableEventType;
  const declaredKey = occurrenceKeyOf(declared, eventType);
  const found = petRows.find((row) => {
    if (excludeId !== undefined && row.id === excludeId) return false;
    if (row.eventType !== declared.eventType) return false;
    if (!isAtLeast(confidenceOf(row), minimumTier)) return false;
    // One-shot act: the type is the identity, no further scoping.
    if (declaredKey === null) return true;
    return occurrenceKeyOf(row, eventType) === declaredKey;
  });
  return found ?? null;
}

/** Every signable row on the pet — owner declarations AND professional
 * signatures alike. Both consumers below reason over this one row set. */
async function fetchSignableRows(petId: string): Promise<DeclaredEventRow[]> {
  return db
    .select({
      id: petEvents.id,
      petId: petEvents.petId,
      eventType: petEvents.eventType,
      occurredAt: petEvents.occurredAt,
      payload: petEvents.payload,
      authorRole: petEvents.authorRole,
      authorVerified: petEvents.authorVerified,
      authorOrganizationId: petEvents.authorOrganizationId,
    })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, petId),
        inArray(petEvents.eventType, [...SIGNABLE_EVENT_TYPES] as string[]),
      ),
    )
    .orderBy(desc(petEvents.occurredAt), desc(petEvents.recordedAt));
}

/** Projects one signable row into its card summary + confirm-form prefill. */
function toPendingDeclaredEvent(
  row: DeclaredEventRow,
  eventType: SignableEventType,
): PendingDeclaredEvent {
  const p = (upcastPayload(eventType as EventType, row.payload) ?? {}) as Record<string, unknown>;
  const occurredAtStr = toDateInputValue(new Date(row.occurredAt));

  if (eventType === "microchip_implanted") {
    const chipNumber = typeof p.chip_number === "string" ? p.chip_number : "";
    return {
      id: row.id,
      eventType,
      summary: chipNumber ? `Microchip ${chipNumber}` : "Microchip",
      prefill: { chipNumber, occurredAt: occurredAtStr },
    };
  }

  const procedure = typeof p.procedure === "string" ? p.procedure : "";
  const label =
    procedure === "castration"
      ? "Castración"
      : procedure === "spay"
        ? "Ovariectomía"
        : "Esterilización";
  return {
    id: row.id,
    eventType,
    summary: label,
    prefill: { occurredAt: occurredAtStr },
  };
}

/**
 * The pet's most recent OWNER-declared event of each signable type that has
 * not yet reached professional verification — at most one per type (the
 * latest); older undeclared records stay visible in the full libreta, this
 * card is a nudge, not the historical record.
 */
export async function fetchPendingDeclaredEvents(petId: string): Promise<PendingDeclaredEvent[]> {
  // The query is pet-scoped, NOT author-scoped: the professional signatures
  // that clear a declaration are separate rows with authorRole="vet", so an
  // owner-only query could never observe them (the original defect).
  const rows = await fetchSignableRows(petId);

  const out: PendingDeclaredEvent[] = [];
  const seenTypes = new Set<SignableEventType>();

  for (const row of rows) {
    if (row.authorRole !== "owner") continue;
    if (!SIGNABLE_EVENT_TYPES.has(row.eventType as SignableEventType)) continue;
    const eventType = row.eventType as SignableEventType;
    // Keep only the latest DECLARATION per type — even when it's already
    // signed, don't fall through to an older pending one of the same type.
    if (seenTypes.has(eventType)) continue;
    seenTypes.add(eventType);

    if (isDeclarationSigned(row, rows)) continue;
    out.push(toPendingDeclaredEvent(row, eventType));
  }

  return out;
}

/** The provenance a submission will be stamped with — `eventAuthorship` from
 * resolveAtenderPet, structurally. */
export type SignerAuthorship = {
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
};

/**
 * Guard for the sign-off actions (atenderMicrochipAction /
 * atenderSterilizationAction): rejects — a no-op, not an edit — when the
 * declared event `confirmEventId` points at no longer exists on this pet, is
 * a different event type, or when THIS SIGNER's submission would add nothing
 * the pet's spine does not already hold. Returns null when it's safe to write.
 *
 * Consistency is structural, not a convention: this reads the SAME row set and
 * scopes the act with the SAME rule as fetchPendingDeclaredEvents. The card and
 * the guard cannot drift apart. This is also the last line of defence for the
 * duplicate-signature damage when a post-action navigation is dropped.
 *
 * ---------------------------------------------------------------------------
 * What "already signed" means for a NON-MATRICULATED signer (RA-2 F2)
 * ---------------------------------------------------------------------------
 * An org member without a validated matrícula is stamped
 * shelter/authorVerified:false (atender-access.ts) → confidence
 * `org_registered`, which event-confidence.ts defines as "a valid institutional
 * RECORD, NOT professional verification". So the honest answer is: THEIR ENTRY
 * IS NOT A SIGNATURE. The professional bar in isDeclarationSigned stays where
 * it is, and the pending card keeps standing after they write — the act really
 * does still need a matriculated signature.
 *
 * The alternative — counting `org_registered` as "signed" so the card clears —
 * was rejected: a receptionist's entry would permanently silence the nudge and
 * the libreta would read as complete while the compliance gate still says it
 * isn't. That destroys information; it does not add any.
 *
 * But "not signed" must NOT mean "write again, forever". That was the measured
 * damage: the page claimed success, the card stayed, and every retry appended
 * another permanent row to a legally-weighted health record. So the guard's
 * question is not "is this act signed?" but "would this submission ADD
 * anything?" — reject when a row for the same act already carries confidence
 * at least equal to the tier this signer produces. Consequences:
 *   - matriculated vet — unchanged: an existing professional row rejects, an
 *     `org_registered` row does NOT (their tier is strictly higher, so their
 *     signature still adds the thing the card is asking for);
 *   - non-matriculated member — a second attempt at an act the org has already
 *     recorded is rejected instead of duplicated.
 * The other half of the fix is UI-side: page.tsx must stop telling a
 * non-matriculated signer that the event was "firmado".
 */
export async function rejectIfAlreadySigned(
  petId: string,
  eventType: SignableEventType,
  confirmEventId: string,
  signer: SignerAuthorship,
): Promise<EventFormState | null> {
  const rows = await fetchSignableRows(petId);
  const target = rows.find((r) => r.id === confirmEventId);

  if (!target || target.petId !== petId || target.eventType !== eventType) {
    return { error: "El evento declarado ya no está disponible." };
  }

  if (isDeclarationSigned(target, rows)) {
    return { error: "Este registro ya fue firmado por un profesional." };
  }

  // Below the professional bar the act can still be already-recorded at this
  // signer's own tier — a duplicate that adds nothing. The declaration row
  // itself is excluded: it is what is being confirmed, not a prior record of it.
  const signerTier = computeConfidence({ ...signer, payload: {} });
  if (!isAtLeast(signerTier, "professional_verified")) {
    const equivalent = findRecordOfSameAct(target, rows, signerTier, target.id);
    if (equivalent) {
      return {
        error:
          "Este acto ya está registrado a nombre de la organización. Falta la firma de un profesional matriculado, que no podés hacer sin matrícula validada.",
      };
    }
  }

  return null;
}
