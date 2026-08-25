// One asiento's detail, turned into es-AR sentences — and the diff its
// correction form submits.
//
// PURE. Same discipline as its siblings: every rule below is a product decision,
// and the correction diff in particular is the kind of logic that must be
// checkable without mounting a form.

import type {
  EventAmendmentV1,
  EventAttachmentV1,
  EventFactV1,
  PetEventDetailV1,
} from "@dim/contract/api";
import type { AmendEventInput } from "@dim/contract/input";

import { AR_TIME_ZONE, formatArDate } from "./libreta-view-model";
import { type SectionView, sectionView } from "./owner-face-view-model";

export type EventDetailView = {
  eventId: string;
  kind: string;
  title: string;
  subtitle: string | null;
  occurredAt: string;
  recordedAt: string;
  notes: string | null;
  location: { lat: number; lng: number } | null;
  authorLine: string;
  facts: EventFactV1[];
  amendments: SectionView<{ items: EventAmendmentV1[] }>;
  attachments: SectionView<{ items: EventAttachmentV1[] }>;
  canAmend: boolean;
  amendRefusal: string | null;
};

export function buildEventDetailView(payload: PetEventDetailV1): EventDetailView {
  return {
    eventId: payload.eventId,
    kind: payload.kind,
    title: payload.title,
    subtitle: payload.subtitle,
    occurredAt: payload.occurredAt,
    recordedAt: payload.recordedAt,
    notes: payload.notes,
    location: payload.location,
    authorLine: authorLine(payload.author),
    facts: payload.facts,
    amendments: sectionView(payload.amendments),
    attachments: sectionView(payload.attachments),
    canAmend: payload.amend.canAmend,
    amendRefusal: payload.amend.refusal,
  };
}

/**
 * WHO signed the record, as one line.
 *
 * The role and the organization arrive already worded; this composes them and
 * marks verification. It never prints a person's name because the payload never
 * carries one — the privacy convention is enforced at the source, and this is
 * the surface that would otherwise be tempted to reconstruct it.
 */
export function authorLine(author: PetEventDetailV1["author"]): string {
  const who = author.orgDisplayName
    ? `${author.roleLabel} · ${author.orgDisplayName}`
    : author.roleLabel;
  return author.verified ? `${who} · firma verificada` : who;
}

// ---------------------------------------------------------------------------
// The correction history
// ---------------------------------------------------------------------------

/**
 * One changed field, as a sentence.
 *
 * The three shapes are genuinely different facts and must not collapse into
 * one: a value REPLACED, a value ADDED where there was none, and a value
 * CLEARED. "Lote: «L-42» → «»" reads as a typo; "Lote: se borró «L-42»" reads as
 * what happened.
 */
export function amendmentChangeLine(change: EventAmendmentV1["changes"][number]): string {
  if (change.from === null && change.to === null) return `${change.label}: sin cambios visibles`;
  if (change.from === null) return `${change.label}: se agregó «${change.to}»`;
  if (change.to === null) return `${change.label}: se borró «${change.from}»`;
  return `${change.label}: «${change.from}» → «${change.to}»`;
}

/**
 * The header of one correction in the history.
 *
 * A correction that moved nothing the libreta SHOWS still appears, and says so
 * plainly — see the contract's `EventAmendmentV1`. Hiding it would be worse than
 * being unable to name what it touched.
 */
export function amendmentHeadline(step: EventAmendmentV1): string {
  return `${formatArDate(step.occurredAt)} · ${step.actorRoleLabel}`;
}

export const AMENDMENT_NO_VISIBLE_CHANGE =
  "Esta corrección no cambió ninguno de los datos que se muestran acá.";

export const AMENDMENTS_EMPTY_LABEL = "Este registro nunca se corrigió.";

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export const ATTACHMENTS_EMPTY_LABEL = "Este registro no tiene archivos adjuntos.";

/** A file the server could not hand over. The web says exactly this. */
export const ATTACHMENT_UNAVAILABLE_LABEL = "Adjunto no disponible";

/**
 * What a non-image attachment does when tapped, said BEFORE it is tapped.
 *
 * This app has no PDF viewer. Opening the system browser is the honest handoff;
 * a tap that silently did nothing, or a viewer that showed a blank page, would
 * be worse than saying where the file is going.
 */
export const ATTACHMENT_EXTERNAL_HINT = "Se abre en el navegador";

/**
 * How long the link has left, or that it is gone.
 *
 * THE EXPIRY IS RENDERED RATHER THAN ASSUMED because the link genuinely stops
 * working: it is a short-lived capability over a private file, and a thumbnail
 * that silently 400s after fifteen minutes teaches people the app is broken.
 * Saying "actualizá" turns a dead link into a one-tap fix.
 */
export function attachmentExpiryLabel(expiresAtIso: string | null, now: Date): string {
  if (expiresAtIso === null) return ATTACHMENT_UNAVAILABLE_LABEL;
  const expires = new Date(expiresAtIso);
  if (Number.isNaN(expires.getTime())) return ATTACHMENT_UNAVAILABLE_LABEL;
  if (expires.getTime() <= now.getTime()) {
    return "El enlace venció. Actualizá para volver a verlo.";
  }
  const minutes = Math.ceil((expires.getTime() - now.getTime()) / 60_000);
  // `hour12: false` STATED, not inherited. es-AR resolves to a 12-hour clock in
  // some ICU builds and to 24 in others, so leaving it to the locale means the
  // same expiry reads "12:15" on one device and "12:15 p. m." on another —
  // measured, not theorised (this printed the second under Node's ICU). Argentina
  // reads a 24-hour clock; the format says so.
  const clock = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: AR_TIME_ZONE,
  }).format(expires);
  return minutes === 1
    ? `El enlace vence en 1 minuto (${clock})`
    : `El enlace vence a las ${clock}`;
}

/** True when the link is past its stated expiry and must not be requested. */
export function attachmentExpired(attachment: EventAttachmentV1, now: Date): boolean {
  if (attachment.url === null || attachment.expiresAt === null) return true;
  const expires = new Date(attachment.expiresAt);
  return Number.isNaN(expires.getTime()) || expires.getTime() <= now.getTime();
}

// ---------------------------------------------------------------------------
// The correction form
// ---------------------------------------------------------------------------

export const AMEND_NO_CHANGES_LABEL =
  "No modificaste ningún campo. Hacé al menos un cambio antes de corregir.";

export const AMEND_IMMUTABILITY_NOTE =
  "La libreta es inmutable. Esta corrección agrega un registro nuevo que reemplaza el valor mostrado. El registro original queda visible en el historial.";

export const AMEND_CONFIRM_LABEL = "Confirmar corrección";

/**
 * The change list a correction submits: the fields whose text the user actually
 * moved, and nothing else.
 *
 * WHY IT DIFFS INSTEAD OF SENDING THE WHOLE FORM. A correction names what
 * CHANGED — it becomes a line in a history somebody reads. Submitting every
 * field would write "Lote: «L-42» → «L-42»" into a ledger and make the real
 * change impossible to find.
 *
 * An emptied input sends `null` rather than `""`, because the two mean different
 * things: `null` clears the field, and an empty string would store a blank value
 * that later reads as a fact somebody entered.
 *
 * The comparison is on TRIMMED text: a trailing space a keyboard inserted is not
 * a correction, and appending an event to say so would be noise in a legal-ish
 * record.
 */
export function buildAmendChanges(
  current: EventFactV1[],
  edits: Record<string, string>,
): AmendEventInput["changes"] {
  const changes: AmendEventInput["changes"] = [];
  for (const fact of current) {
    const next = (edits[fact.field] ?? "").trim();
    if (next === fact.value.trim()) continue;
    changes.push({ field: fact.field, value: next.length === 0 ? null : next });
  }
  return changes;
}

/**
 * The form's starting text, one entry per curated row.
 *
 * THE FORM EDITS THE CURATED ROWS AND NOTHING ELSE, which is narrower than the
 * web — its form lists every key of the raw payload, including ones no screen
 * renders. Narrower on purpose: a field the ledger does not show is a field
 * nobody can see themselves correcting, and `firma_hash` appearing in a
 * correction form is an invitation to break a record.
 */
export function initialAmendEdits(facts: EventFactV1[]): Record<string, string> {
  return Object.fromEntries(facts.map((fact) => [fact.field, fact.value]));
}
