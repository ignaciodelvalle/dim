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

import type { ReminderVariant } from "@/lib/vaccine-reminder-state";

// Minimal event shape — decoupled from ProjectionEvent so tests stay trivial.
export type ComplianceEvent = {
  eventType: string;
  payload: unknown;
  occurredAt: Date | string;
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

function hasEvent(events: ComplianceEvent[], eventType: string): boolean {
  return events.some((e) => e.eventType === eventType);
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

  if (input.rabiesReminder) {
    return rabiesFromVariant(input.rabiesReminder.variant, input.rabiesReminder.dueAt);
  }

  // Fallback: derive from the latest rabies vaccination event's next_due_at.
  const doses = input.events
    .filter((e) => {
      if (e.eventType !== "vaccination_administered") return false;
      const p = (e.payload ?? {}) as Record<string, unknown>;
      const name = typeof p.vaccine_name === "string" ? p.vaccine_name.toLowerCase() : "";
      return /antirr[aá]b|rabi/.test(name);
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const latest = doses[0];
  if (latest) {
    const p = (latest.payload ?? {}) as Record<string, unknown>;
    const nextDueRaw = typeof p.next_due_at === "string" ? p.next_due_at : null;
    const nextDue = nextDueRaw ? new Date(nextDueRaw) : null;
    if (nextDue && Number.isFinite(nextDue.getTime())) {
      return nextDue <= input.now
        ? rabiesFromVariant("overdue", nextDue)
        : rabiesFromVariant("upcoming", nextDue);
    }
  }

  return {
    key: "rabies",
    label: "Vacuna antirrábica",
    state: "Sin registro",
    tone: "neutral",
    detail: null,
    legalFootnote: FOOTNOTE.rabies,
  };
}

function deriveSterilization(input: ComplianceInput): ObligationCard {
  const done = hasEvent(input.events, "sterilization_performed");
  return {
    key: "sterilization",
    label: "Esterilización",
    state: done ? "Registrada" : "Sin registro",
    tone: done ? "ok" : "neutral",
    detail: null,
    legalFootnote: FOOTNOTE.sterilization,
  };
}

function deriveMicrochip(input: ComplianceInput): ObligationCard {
  const code = input.microchipCode;
  return {
    key: "microchip",
    label: "Microchip",
    state: code ? "Sí" : "Sin registro",
    tone: code ? "ok" : "neutral",
    detail: code,
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
