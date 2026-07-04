// ---------------------------------------------------------------------------
// Pet compliance projection (owner "comply-first" slice, 2026-07-01)
// Spec: docs/superpowers/specs/2026-07-01-owner-compliance-first-slice-handoff.md §2
//
// Projects a pet's append-only events (+ its active reminders and jurisdiction
// gate) into the four legal obligations the owner sees at the top of the pet
// profile: rabies vaccine, sterilization, microchip, and PPP attestation.
//
// This is PURE derivation — (events, reminders, rules) -> view. The pet profile
// RSC already loads every input (typedEvents, petActiveReminders,
// canonicalIds.microchip, pet.potentiallyDangerousBreed), so no DB round-trip is
// needed here. The handoff called this `fetchComplianceState`; it is a pure
// `deriveComplianceState` because nothing is fetched — all inputs arrive
// resolved, which also keeps it trivially table-testable.
//
// No new color tokens, no schema migration, no new event types (token ratchet).
// ---------------------------------------------------------------------------

import type { ReminderVariant } from "@/lib/domain/vaccine-reminder-state";
import { computeConfidence } from "@/lib/events/event-confidence";

// Minimal event shape — decoupled from ProjectionEvent so tests stay trivial.
// Carries provenance (the ConfidenceInput fields) so an obligation is only
// cleared by a professional/institutional-verified event (H1, 2026-07-01).
export type ComplianceEvent = {
  eventType: string;
  payload: unknown;
  occurredAt: Date | string;
  authorRole?: string;
  authorVerified?: boolean;
  authorOrganizationId?: string | null;
};

// The already-filtered rabies reminder, if the pet has one. The caller isolates
// it from the active reminder set (by title) so this module stays pure and free
// of reminder-fetching concerns.
export type RabiesReminder = {
  variant: ReminderVariant;
  dueAt: Date;
};

// A confirmed future rabies appointment (WS-2 "Turno reservado"). Optional in
// WS-1 — the page wires it in WS-2.
export type ReservedRabiesTurno = {
  date: Date;
  provider: string | null;
};

export type ObligationKey = "rabies" | "sterilization" | "microchip" | "ppp";

// Visual tone shared across the obligation cards. `ok`/`due`/`over` map onto the
// existing LnVstamp variants; `reserved` uses the celeste family (WS-2);
// `neutral` is "sin registro / no aplica todavía".
export type ComplianceTone = "ok" | "due" | "over" | "reserved" | "neutral";

export type ObligationCard = {
  key: ObligationKey;
  label: string; // es-AR obligation title
  state: string; // es-AR short state label
  tone: ComplianceTone;
  detail: string | null; // es-AR secondary line (date, provider, chip number)
  legalFootnote: string; // es-AR muted legal citation
  hint?: string | null; // es-AR nudge to get a self-reported event verified (H1)
};

export type ComplianceState = {
  cards: ObligationCard[]; // ordered worst-state first
  summary: { total: number; ok: number; label: string }; // "3 de 4 al día"
  worstTone: ComplianceTone; // mirrored by the panel header chip
};

export type ComplianceInput = {
  now: Date;
  events: ComplianceEvent[];
  rabiesReminder: RabiesReminder | null;
  reservedRabiesTurno: ReservedRabiesTurno | null; // WS-2
  microchipCode: string | null; // from fetchActiveIdentifications().microchip
  pppApplies: boolean; // jurisdiction gate (pet.potentiallyDangerousBreed)
};

// Legal footnotes — real norms per docs/legal-framework-full.md / AGENTS.md.
// Kept as one muted line each; never a banner (handoff §5).
const FOOTNOTE = {
  rabies: "Obligación del propietario · Ord. CABA 41.831 · Ley 22.953",
  sterilization: "Evento verificado en la libreta",
  microchip: "Identificación · Ord. CABA 41.831 art. 4°",
  ppp: "Régimen perros potencialmente peligrosos · regla jurisdiccional",
} as const;

// Worst-first ordering. Lower number = more urgent = shown first.
const TONE_SEVERITY: Record<ComplianceTone, number> = {
  over: 0,
  due: 1,
  neutral: 2,
  reserved: 3,
  ok: 4,
};

// es-AR nudges shown on a "Declarada · sin verificar" card (H1).
const HINT = {
  sterilization: "Pedile a tu veterinario que la registre para que cuente.",
  microchip: "Pedile a quien lo implantó que lo registre para que cuente.",
  rabies: "La cargaste vos; pedí que un veterinario la registre para que cuente como al día.",
} as const;

const DECLARADA_STATE = "Declarada · sin verificar";

function hasEvent(events: ComplianceEvent[], eventType: string): boolean {
  return events.some((e) => e.eventType === eventType);
}

// H1: an obligation is only met when the satisfying event was authored by a
// professional or institution. A self-reported / corroborated / unverified
// event is "declared, not verified" and does not count toward "al día".
function clearsObligation(e: ComplianceEvent): boolean {
  const tier = computeConfidence({
    authorRole: e.authorRole ?? "",
    authorVerified: e.authorVerified ?? false,
    authorOrganizationId: e.authorOrganizationId ?? null,
    payload: (e.payload ?? {}) as Record<string, unknown>,
  });
  return tier === "professional_verified" || tier === "institutional_verified";
}

function declaradaCard(
  key: ObligationKey,
  label: string,
  legalFootnote: string,
  hint: string,
  detail: string | null = null,
): ObligationCard {
  return { key, label, state: DECLARADA_STATE, tone: "neutral", detail, legalFootnote, hint };
}

// The latest rabies vaccination event (by occurredAt), if any.
function latestRabiesDose(events: ComplianceEvent[]): ComplianceEvent | undefined {
  return events
    .filter((e) => {
      if (e.eventType !== "vaccination_administered") return false;
      const p = (e.payload ?? {}) as Record<string, unknown>;
      const name = typeof p.vaccine_name === "string" ? p.vaccine_name.toLowerCase() : "";
      return /antirr[aá]b|rabi/.test(name);
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

// Map a reminder variant to the coarse compliance tone + labels.
function rabiesFromVariant(variant: ReminderVariant, dueAt: Date): ObligationCard {
  if (variant === "due_soon") {
    return {
      key: "rabies",
      label: "Vacuna antirrábica",
      state: "Por vencer",
      tone: "due",
      detail: `Vence ${formatDate(dueAt)}`,
      legalFootnote: FOOTNOTE.rabies,
    };
  }
  if (variant === "overdue" || variant === "overdue_critical") {
    return {
      key: "rabies",
      label: "Vacuna antirrábica",
      state: "Vencida",
      tone: "over",
      detail: `Venció ${formatDate(dueAt)}`,
      legalFootnote: FOOTNOTE.rabies,
    };
  }
  // upcoming | success
  return {
    key: "rabies",
    label: "Vacuna antirrábica",
    state: "Vigente",
    tone: "ok",
    detail: `Próxima ${formatDate(dueAt)}`,
    legalFootnote: FOOTNOTE.rabies,
  };
}

// The rabies obligation. Priority: a reserved turno (WS-2) wins the display,
// then the active reminder's variant, then a fallback to raw events, then
// "sin registro".
function deriveRabies(input: ComplianceInput): ObligationCard {
  if (input.reservedRabiesTurno) {
    const { date, provider } = input.reservedRabiesTurno;
    const providerSuffix = provider ? ` · ${provider}` : "";
    return {
      key: "rabies",
      label: "Vacuna antirrábica",
      state: "Turno reservado",
      tone: "reserved",
      detail: `${formatDate(date)}${providerSuffix}`,
      legalFootnote: FOOTNOTE.rabies,
    };
  }

  const dose = latestRabiesDose(input.events);

  // Base state: reminder variant, else the latest dose's next_due_at, else none.
  let base: ObligationCard;
  if (input.rabiesReminder) {
    base = rabiesFromVariant(input.rabiesReminder.variant, input.rabiesReminder.dueAt);
  } else if (dose) {
    const p = (dose.payload ?? {}) as Record<string, unknown>;
    const nextDueRaw = typeof p.next_due_at === "string" ? p.next_due_at : null;
    const nextDue = nextDueRaw ? new Date(nextDueRaw) : null;
    base =
      nextDue && Number.isFinite(nextDue.getTime())
        ? nextDue <= input.now
          ? rabiesFromVariant("overdue", nextDue)
          : rabiesFromVariant("upcoming", nextDue)
        : {
            key: "rabies",
            label: "Vacuna antirrábica",
            state: "Sin registro",
            tone: "neutral",
            detail: null,
            legalFootnote: FOOTNOTE.rabies,
          };
  } else {
    base = {
      key: "rabies",
      label: "Vacuna antirrábica",
      state: "Sin registro",
      tone: "neutral",
      detail: null,
      legalFootnote: FOOTNOTE.rabies,
    };
  }

  // H1: a "Vigente" (al día) claim must be backed by a professional/institutional
  // dose. If currency rests only on a self-reported dose (or none), downgrade to
  // "Declarada · sin verificar" while keeping the due-date detail.
  if (base.tone === "ok" && !(dose && clearsObligation(dose))) {
    return declaradaCard("rabies", "Vacuna antirrábica", FOOTNOTE.rabies, HINT.rabies, base.detail);
  }
  return base;
}

function deriveSterilization(input: ComplianceInput): ObligationCard {
  const event = input.events.find((e) => e.eventType === "sterilization_performed");
  if (!event) {
    return {
      key: "sterilization",
      label: "Esterilización",
      state: "Sin registro",
      tone: "neutral",
      detail: null,
      legalFootnote: FOOTNOTE.sterilization,
    };
  }
  if (clearsObligation(event)) {
    return {
      key: "sterilization",
      label: "Esterilización",
      state: "Registrada",
      tone: "ok",
      detail: null,
      legalFootnote: FOOTNOTE.sterilization,
    };
  }
  return declaradaCard(
    "sterilization",
    "Esterilización",
    FOOTNOTE.sterilization,
    HINT.sterilization,
  );
}

function deriveMicrochip(input: ComplianceInput): ObligationCard {
  const code = input.microchipCode;
  const implant = input.events.find((e) => e.eventType === "microchip_implanted");
  if (implant && clearsObligation(implant)) {
    return {
      key: "microchip",
      label: "Microchip",
      state: "Sí",
      tone: "ok",
      detail: code,
      legalFootnote: FOOTNOTE.microchip,
    };
  }
  // Code known (from identifications) or a self-reported implant event, but not
  // backed by a professional/institutional record → declared, not verified.
  if (code || implant) {
    return declaradaCard("microchip", "Microchip", FOOTNOTE.microchip, HINT.microchip, code);
  }
  return {
    key: "microchip",
    label: "Microchip",
    state: "Sin registro",
    tone: "neutral",
    detail: null,
    legalFootnote: FOOTNOTE.microchip,
  };
}

// PPP is only appended when the jurisdiction gate applies (handoff D2: hide when
// the breed is not on the jurisdiction's ppp_breed_list).
function derivePpp(input: ComplianceInput): ObligationCard {
  const attested = hasEvent(input.events, "dangerous_breed_attested");
  return {
    key: "ppp",
    label: "Atestación PPP",
    state: attested ? "Atestada" : "Atestación requerida",
    tone: attested ? "ok" : "due",
    detail: null,
    legalFootnote: FOOTNOTE.ppp,
  };
}

/**
 * Single source for the pet hero's microchip tag — mirrors the microchip
 * obligation card's tone so the hero and the compliance panel never disagree
 * about whether a microchip is verified.
 *
 * Before this helper, the pet profile hero pushed "Microchip verificado"
 * whenever ANY microchip code was on file (`canonicalIds.microchip`),
 * regardless of provenance, while the compliance card below it (this same
 * module's `deriveMicrochip`) correctly required a professional/institutional
 * event to say "verified" — showing "Declarada · sin verificar" for a
 * self-reported chip. Same pet, same screen, two different claims about the
 * same fact (clickthrough audit 2026-07-03/04, Segmento 1 #6). Both surfaces
 * now read this one function.
 */
export function microchipHeroTag(compliance: ComplianceState): string | null {
  const card = compliance.cards.find((c) => c.key === "microchip");
  if (!card) return null;
  if (card.tone === "ok") return "Microchip verificado";
  if (card.state !== "Sin registro") return "Microchip declarado";
  return null;
}

/**
 * Map a pet row + its compliance projection onto the status chip shown on the
 * credential header and every pet list row (LnStatusFlag / LnRegRow).
 *
 * AL DÍA ("ok") is a COMPLIANCE claim, not an aliveness claim — it is only
 * granted when every tracked obligation is verified-satisfied; otherwise the
 * credential is simply REGISTRADA. Lost and pregnancy override compliance.
 *
 * This is THE single mapper for every surface that shows the chip (detail
 * header, /inicio registry, /mis-mascotas list) — QA round 2 (2026-07-03)
 * caught the same pet reading "AL DÍA" on the lists and "REGISTRADA · 0 de 3
 * al día" on its own header.
 */
export function lnPetStatusFromCompliance(
  pet: { status: string; pregnancyStatus: string | null },
  compliance: ComplianceState,
): "ok" | "registered" | "lost" | "pregnant" {
  if (pet.status === "lost") return "lost";
  if (pet.pregnancyStatus === "in_progress") return "pregnant";
  return compliance.summary.ok === compliance.summary.total ? "ok" : "registered";
}

/**
 * Compose the four owner obligations into an ordered, summarized compliance
 * view. Cards are sorted worst-state first; the PPP card is omitted entirely
 * when it does not apply to the pet's jurisdiction.
 */
export function deriveComplianceState(input: ComplianceInput): ComplianceState {
  const cards: ObligationCard[] = [
    deriveRabies(input),
    deriveSterilization(input),
    deriveMicrochip(input),
  ];
  if (input.pppApplies) {
    cards.push(derivePpp(input));
  }

  cards.sort((a, b) => TONE_SEVERITY[a.tone] - TONE_SEVERITY[b.tone]);

  const total = cards.length;
  const ok = cards.filter((c) => c.tone === "ok").length;
  const worstTone = cards.length > 0 ? cards[0].tone : "ok";

  return {
    cards,
    summary: { total, ok, label: `${ok} de ${total} al día` },
    worstTone,
  };
}
