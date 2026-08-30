// MUDANZA — turning what somebody picked into what the contract accepts, and
// what the server stored into what a person reads.
//
// PURE, like every other view-model in this app: it owns the es-AR sentence for
// every state and every refusal, and nothing here touches the network.
//
// THE VALIDATION IS THE SERVER'S OWN SCHEMA, imported and not re-stated — the
// rule `transfers-view-model.ts`, `lost-view-model.ts` and `shares-view-model.ts`
// all follow. What lives here is the WORDS: the contract carries codes, the
// consumer owns its copy.
//
// THE CURRENT JURISDICTION IS READ, NEVER DERIVED. It arrives on
// `OwnerPetDetailV1.identity`, which is a `CredentialSection` — so "the server
// could not load it" and "this animal has no locality on file" are DIFFERENT
// facts and this file keeps them different. A screen that collapsed them would
// tell somebody their animal has no registered locality during a pooler outage,
// which is the one sentence that would make them register a move they do not
// need to make.
//
// AND THE SCREEN NEVER PRE-JUDGES WHO MAY MOVE AN ANIMAL. There is no
// capability flag on this feature and there must not be a local guess: the rule
// is `requireTitularAccess`'s (every active holder except a caretaker, the
// organisation path included), it lives on the server, and the screen renders
// the 403 rather than hiding the button. A local "am I the owner?" would be a
// second copy of an authorization rule — and it would be WRONG, because it would
// refuse a foster the browser admits.

import type { OwnerPetDetailV1, PetMoveJurisdictionV1 } from "@dim/contract/api";
import type { PetMoveCommandInput, PetMoveCommandInputCode } from "@dim/contract/input";
import { firstPetMoveCommandInputCode, petMoveCommandInputSchema } from "@dim/contract/input";

/** What the destination picker hands back, before it is a command. */
export type MoveDraft = {
  provinceCode: string;
  localityName: string;
  reason: string;
};

export const EMPTY_MOVE_DRAFT: MoveDraft = { provinceCode: "", localityName: "", reason: "" };

export type MoveCommandResult =
  | { ok: true; input: PetMoveCommandInput }
  | { ok: false; code: PetMoveCommandInputCode | null; message: string };

/** One sentence per input code. No code falls through to a generic shrug. */
export function moveInputCodeMessage(code: PetMoveCommandInputCode | null): string {
  switch (code) {
    case "DESTINATION_REQUIRED":
      // ONE MESSAGE FOR BOTH HALVES, because they arrive from ONE control: the
      // picker writes `provinceCode` and `localityName` in the same tap and
      // clears both in the same tap. A sentence naming the province would point
      // at a field this screen does not draw.
      return "Elegí la localidad de destino de la lista.";
    case "REASON_TOO_LONG":
      return "El motivo es muy largo. Contalo en menos palabras.";
    case "COMMAND_REQUIRED":
    case null:
      return "No pudimos armar la mudanza. Volvé a elegir la localidad.";
  }
}

/**
 * REGISTRAR LA MUDANZA, from the form's two answers.
 *
 * The reason is trimmed to `null` rather than to `""`, matching every other
 * optional free-text field on this surface: the contract's own transform reads a
 * blank as "not stated", and sending `""` would be the client asking the schema
 * to decide something it has already decided.
 */
export function buildMove(draft: MoveDraft): MoveCommandResult {
  const parsed = petMoveCommandInputSchema.safeParse({
    command: "record_move",
    provinceCode: draft.provinceCode,
    localityName: draft.localityName,
    reason: draft.reason.trim() || null,
  });
  if (parsed.success) return { ok: true, input: parsed.data };
  const code = firstPetMoveCommandInputCode(parsed.error);
  return { ok: false, code, message: moveInputCodeMessage(code) };
}

/**
 * WHERE THE ANIMAL LIVES TODAY, as three distinct states.
 *
 * `unavailable` is NOT `none`. The identity section can fail to load, and a
 * screen that rendered that as "no tiene localidad registrada" would invite a
 * move nobody needs — which is why this is a discriminated union and not a
 * nullable string.
 */
export type CurrentJurisdiction =
  | { kind: "known"; label: string; province: string; locality: string | null }
  | { kind: "none" }
  | { kind: "unavailable" };

export function currentJurisdiction(detail: OwnerPetDetailV1): CurrentJurisdiction {
  if (detail.identity.status !== "ok") return { kind: "unavailable" };
  const { jurisdictionProvince, jurisdictionLocality } = detail.identity.data;
  if (!jurisdictionProvince && !jurisdictionLocality) return { kind: "none" };
  return {
    kind: "known",
    // LOCALITY FIRST, PROVINCE SECOND — the order the web prints on the same
    // locked row (`PetForm.tsx`: `[locality, province].filter(Boolean).join(", ")`).
    // A person reads the smaller place first.
    label: [jurisdictionLocality, jurisdictionProvince].filter(Boolean).join(", "),
    province: jurisdictionProvince ?? "",
    locality: jurisdictionLocality ?? null,
  };
}

/** The animal's name, or null when the section did not load. */
export function petNameFrom(detail: OwnerPetDetailV1): string | null {
  return detail.identity.status === "ok" ? detail.identity.data.name : null;
}

/**
 * What the screen says AFTER the move landed.
 *
 * IT NAMES THE CANONICAL PAIR THE SERVER RETURNED, never the one that was
 * typed. The destination is resolved against the INDEC catalog before it is
 * stored, so "bariloche" comes back as "San Carlos de Bariloche, Río Negro" —
 * and the difference is the whole point of showing it: a person who typed a
 * short form gets to see which official locality their animal is now registered
 * in, and would otherwise have to take it on faith.
 */
export function moveRecordedMessage(jurisdiction: PetMoveJurisdictionV1): string {
  return `Listo. ${jurisdiction.locality}, ${jurisdiction.province} quedó registrada como la jurisdicción de tu mascota, y el movimiento quedó anotado en la libreta.`;
}
