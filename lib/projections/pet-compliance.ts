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

import { type ProvenanceTier, provenanceTier } from "@/lib/domain/provenance";
import type { ReminderVariant } from "@/lib/domain/vaccine-reminder-state";
import { computeConfidence } from "@/lib/events/event-confidence";
import { formatDateArOmitCurrentYear, parseDateInput } from "@/lib/utils/format";

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

// DUAL vaccine state (task #78 Part 1 — the "0 de 4 · DECLARADA" #4 fix). A
// diligent owner who vaccinated but has no vet signature used to see a single
// flat "Declarada · sin verificar" badge that reads as "you have nothing". The
// dual block splits the two honest truths the credential must tell at once:
//   • what the owner HAS (the currency lens — the dose is on record and vigente)
//   • what the official REGISTRY still needs (a matriculated vet signature).
// Present ONLY on the rabies card, and only for a declared (unsigned) dose.
export type ComplianceDual = {
  ownerLabel: string; // es-AR "lo que tenés" line ("Antirrábica cargada por vos")
  currencyLabel: string | null; // es-AR currency chip ("Vigente" / "Por vencer" / "Vencida")
  currencyTone: "ok" | "due" | "over" | null; // tone of the currency chip
  registryLine: string; // es-AR "lo que pide el registro" educational nudge
};

export type ObligationCard = {
  key: ObligationKey;
  label: string; // es-AR obligation title
  state: string; // es-AR short state label
  tone: ComplianceTone;
  detail: string | null; // es-AR secondary line (date, provider, chip number)
  legalFootnote: string; // es-AR muted legal citation
  hint?: string | null; // es-AR nudge to get a self-reported event verified (H1)
  // Provenance lens (task #78): declarado / verificado / firmado_matricula, from
  // the satisfying event's author. Lets a surface caption WHO signed the record
  // without re-deriving it. Omitted when there is no satisfying event.
  provenance?: ProvenanceTier;
  // Dual honest vaccine state — see ComplianceDual. Rabies-only, declared-dose-only.
  dual?: ComplianceDual;
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
  // Jurisdiction gate for the microchip obligation, resolved from the
  // `microchip_required` business rule for the pet's jurisdiction (default
  // TRUE — every jurisdiction requires a chip until one opts out). Optional so
  // pre-existing callers/tests keep the old universal behavior. When FALSE and
  // no chip is on record, the obligation card is omitted entirely (it drops out
  // of the "N de M al día" count); a chip that IS registered still shows,
  // because a registered chip is information, not an unmet obligation.
  microchipApplies?: boolean;
  pppApplies: boolean; // authoritative jurisdiction gate (pet.potentiallyDangerousBreed)
  // PPP-determinability inputs (2026-07-04). PPP is dogs-only, and the size rule
  // needs the pet's WEIGHT while the breed rule needs its BREED. A dog registered
  // through the fast path has neither (both live in the optional "Otros" block),
  // so `pppApplies` is false and the PPP obligation used to vanish silently. When
  // a DOG is missing breed and/or weight we surface an "indeterminado" obligation
  // instead of hiding it — strong-but-optional (PO 2026-07-04): the alta is never
  // blocked, but the obligation GRITA until the two fields are completed. Optional
  // so pre-existing callers/tests default to "not a dog / no data" (no card).
  species?: string | null;
  breed?: string | null;
  estimatedWeightKg?: number | string | null;
};

// Legal footnotes — real norms per docs/legal-framework-full.md / AGENTS.md.
// Kept as one muted line each; never a banner (handoff §5).
const FOOTNOTE = {
  rabies: "Obligación del propietario · Ord. CABA 41.831 · Ley 22.953",
  // Neutralized from a hardcoded CABA ordinance: the microchip obligation is now
  // gated per-jurisdiction (microchip_required rule), so a pet outside CABA must
  // not be shown a CABA article as if it were its own norm. The rule's resolved
  // jurisdiction context is not plumbed this far; cite the applicable-norm class
  // instead of inventing per-province ordinance numbers.
  microchip: "Identificación · según normativa jurisdiccional",
  ppp: "Régimen perros potencialmente peligrosos · regla jurisdiccional",
} as const;

// The sterilization footnote must AGREE with the card's verification state. A
// "Declarada · sin verificar" seal cannot sit above "Evento verificado en la
// libreta" — that is the credential contradicting itself (adversarial-citizen
// 2026-07-06, same class as the rabies "Registrada"/"Declarada" split). Each
// state carries its own provenance line so the seal, the footnote and the
// "N de M al día" summary always tell the same story.
const STERILIZATION_FOOTNOTE = {
  verified: "Evento verificado en la libreta",
  declared: "Declarado por el titular, sin verificación profesional",
  none: "Sin registro en la libreta",
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

// Rabies dual-state copy (task #78 Part 1 / #4). The registry line is educational
// AND a nudge — a vet signature turns declared data into verified data, which is
// what the whole system wants more of.
const REGISTRY_NEEDS_LINE =
  "Para figurar “al día” en el registro oficial, un veterinario matriculado tiene que firmarla.";
const RABIES_DECLARED_BADGE = "Declarada"; // provenance-lens badge; the dual block carries the rest

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
  // provenance: "declarado" — something IS on record, it just isn't
  // professional/institutional-verified (medianos-sesión-2 finding #4). Without
  // this, every declared-only card (sterilization, microchip, and the rabies
  // fallback below) was indistinguishable from a genuinely absent obligation to
  // any surface deriving wording from `tone` alone — the credential-face summary
  // (CredentialFace.tsx) read a Declarada card as "falta X" (missing), the exact
  // contradiction its own doc comment warns against ("a declared-only card is
  // not 'falta'").
  return {
    key,
    label,
    state: DECLARADA_STATE,
    tone: "neutral",
    detail,
    legalFootnote,
    hint,
    provenance: "declarado",
  };
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

// formatDateArOmitCurrentYear (lib/utils/format.ts) is AR_TIME_ZONE-pinned
// (PJ-M3: without it a date-only midnight-UTC value renders as the previous
// day in AR, and SSR/hydration disagree) AND appends the year the moment the
// date's AR-calendar year differs from `now`'s — a bare "Vence 18/07" reads
// as THIS year every time, which is silently wrong the one day a due date
// crosses into next year (medianos-sesión-2 finding #1). `now` threads
// through from ComplianceInput so the comparison always uses the caller's
// pinned instant, not a fresh `new Date()` at format time.

// A date-only "YYYY-MM-DD" next_due_at is midnight UTC = the previous AR
// calendar day; anchor it at NOON UTC (parseDateInput) so a dose "due today" in
// AR is not read Vencida from 21:00 the prior AR day (PJ-M3). Full ISO
// timestamps (with a time component) carry their own instant and pass through.
function parseNextDue(raw: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parseDateInput(raw) : new Date(raw);
}

// Map a reminder variant to the coarse compliance tone + labels.
function rabiesFromVariant(variant: ReminderVariant, dueAt: Date, now: Date): ObligationCard {
  if (variant === "due_soon") {
    return {
      key: "rabies",
      label: "Vacuna antirrábica",
      state: "Por vencer",
      tone: "due",
      detail: `Vence ${formatDateArOmitCurrentYear(dueAt, now)}`,
      legalFootnote: FOOTNOTE.rabies,
    };
  }
  if (variant === "overdue" || variant === "overdue_critical") {
    return {
      key: "rabies",
      label: "Vacuna antirrábica",
      state: "Vencida",
      tone: "over",
      detail: `Venció ${formatDateArOmitCurrentYear(dueAt, now)}`,
      legalFootnote: FOOTNOTE.rabies,
    };
  }
  // upcoming | success
  return {
    key: "rabies",
    label: "Vacuna antirrábica",
    state: "Vigente",
    tone: "ok",
    detail: `Próxima ${formatDateArOmitCurrentYear(dueAt, now)}`,
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
      detail: `${formatDateArOmitCurrentYear(date, input.now)}${providerSuffix}`,
      legalFootnote: FOOTNOTE.rabies,
    };
  }

  const dose = latestRabiesDose(input.events);

  // No dose at all → "Sin registro". (A reminder without a dose still needs the
  // dose to judge provenance, so it also lands here for the provenance overlay.)
  if (!dose && !input.rabiesReminder) {
    return {
      key: "rabies",
      label: "Vacuna antirrábica",
      state: "Sin registro",
      tone: "neutral",
      detail: null,
      legalFootnote: FOOTNOTE.rabies,
    };
  }

  // ---- CURRENCY base (WHO-agnostic): reminder variant, else next_due_at ----
  // `currencyKnown` marks whether the tone reflects a real vigencia (Vigente /
  // Por vencer / Vencida) vs. a dose on record whose currency we can't judge.
  let base: ObligationCard;
  let currencyKnown: boolean;
  if (input.rabiesReminder) {
    base = rabiesFromVariant(input.rabiesReminder.variant, input.rabiesReminder.dueAt, input.now);
    currencyKnown = true;
  } else {
    // dose is defined here (the early return above handled the no-dose case).
    const p = (dose?.payload ?? {}) as Record<string, unknown>;
    const nextDueRaw = typeof p.next_due_at === "string" ? p.next_due_at : null;
    const nextDue = nextDueRaw ? parseNextDue(nextDueRaw) : null;
    if (nextDue && Number.isFinite(nextDue.getTime())) {
      base =
        nextDue <= input.now
          ? rabiesFromVariant("overdue", nextDue, input.now)
          : rabiesFromVariant("upcoming", nextDue, input.now);
      currencyKnown = true;
    } else {
      // A dose IS on record but its payload carries no next_due_at, so we can't
      // judge currency. This must NOT read "Sin registro" — the libreta shows a
      // real antirrábica asiento (UX gate M5a). Raw base is "Registrada"/ok; the
      // provenance overlay below decides signed ("Registrada") vs declared.
      // Compute the Date on its own line (not inside the ${} interpolation) so
      // the no-raw-date-in-sql guard doesn't flag this display string.
      const appliedAt = new Date(dose?.occurredAt ?? input.now);
      base = {
        key: "rabies",
        label: "Vacuna antirrábica",
        state: "Registrada",
        tone: "ok",
        detail: `Aplicada ${formatDateArOmitCurrentYear(appliedAt, input.now)}`,
        legalFootnote: FOOTNOTE.rabies,
      };
      currencyKnown = false;
    }
  }

  // ---- PROVENANCE overlay (task #78) ----
  const tier: ProvenanceTier | null = dose
    ? provenanceTier({
        authorRole: dose.authorRole,
        authorVerified: dose.authorVerified,
        authorOrganizationId: dose.authorOrganizationId,
        payload: (dose.payload ?? {}) as Record<string, unknown>,
      })
    : null;
  // "Signed" (clears the al-día gate) iff the provenance is verificado /
  // firmado_matricula — the exact complement of `declarado` (invariant tested in
  // provenance.test.ts against clearsObligation).
  const signed = tier != null && tier !== "declarado";

  // A DECLARED dose (owner-reported or org-recorded, no matrícula) → DUAL honest
  // card (#4). It stops reading as a flat contradiction: the owner sees the dose
  // IS on record (and its currency), plus exactly what the registry still needs.
  if (dose && !signed) {
    const currencyLabel = currencyKnown ? base.state : null; // Vigente/Por vencer/Vencida
    const currencyTone = currencyKnown ? (base.tone as "ok" | "due" | "over") : null;
    const ownerDeclared = (dose.authorRole ?? "") === "owner";
    // Counting tone: a vigente-declared dose must NOT count as "al día" (neutral),
    // but a por-vencer / vencida dose keeps its currency urgency so the owner
    // still sees "renovála" — provenance never hides an expiry.
    const countingTone: ComplianceTone = base.tone === "ok" ? "neutral" : base.tone;
    return {
      key: "rabies",
      label: "Vacuna antirrábica",
      state: base.tone === "ok" ? RABIES_DECLARED_BADGE : base.state,
      tone: countingTone,
      detail: base.detail,
      legalFootnote: FOOTNOTE.rabies,
      provenance: "declarado",
      dual: {
        ownerLabel: ownerDeclared
          ? "Antirrábica cargada por vos"
          : "Antirrábica registrada sin firma de matrícula",
        currencyLabel,
        currencyTone,
        registryLine: REGISTRY_NEEDS_LINE,
      },
    };
  }

  // Reminder claims currency ("Vigente"/ok) but NO dose backs it (reachable only
  // when `dose` is null — the dose branch returned above). H1: an "al día" claim
  // needs a signed dose, and with no dose there is nothing to surface as dual, so
  // fall back to the plain declarada card.
  if (base.tone === "ok" && !signed) {
    return declaradaCard("rabies", "Vacuna antirrábica", FOOTNOTE.rabies, HINT.rabies, base.detail);
  }

  // Signed dose (or a reminder-only due/over base) → keep the currency card,
  // tagged with its provenance tier for surfaces that caption it.
  return tier ? { ...base, provenance: tier } : base;
}

function deriveSterilization(input: ComplianceInput): ObligationCard {
  // Select the BEST-provenance sterilization event, not the earliest (H1 fix):
  // `find` returns the first (oldest, ascending caller) match, so an early
  // owner-declared event masked a later vet-VERIFIED one and the pet read
  // non-compliant despite a signed record. Any satisfying event clears it.
  const events = input.events.filter((e) => e.eventType === "sterilization_performed");
  if (events.length === 0) {
    return {
      key: "sterilization",
      label: "Esterilización",
      state: "Sin registro",
      tone: "neutral",
      detail: null,
      legalFootnote: STERILIZATION_FOOTNOTE.none,
    };
  }
  if (events.some(clearsObligation)) {
    return {
      key: "sterilization",
      label: "Esterilización",
      state: "Registrada",
      tone: "ok",
      detail: null,
      legalFootnote: STERILIZATION_FOOTNOTE.verified,
    };
  }
  return declaradaCard(
    "sterilization",
    "Esterilización",
    STERILIZATION_FOOTNOTE.declared,
    HINT.sterilization,
  );
}

// The microchip obligation. Returns null ONLY when the jurisdiction does not
// require a chip AND none is on record — then there is no obligation to surface
// and it drops out of the "N de M al día" count. A registered chip (declared or
// verified) always shows, regardless of the jurisdiction gate: it is
// information the credential should surface, not an unmet obligation.
function deriveMicrochip(input: ComplianceInput): ObligationCard | null {
  const code = input.microchipCode;
  // Default TRUE: undefined preserves the pre-gate universal behavior.
  const applies = input.microchipApplies !== false;
  // Best-provenance selection, not earliest (H1 fix): a later vet/institution
  // implant event must clear the obligation even if an earlier owner-declared
  // one exists. `some` picks any satisfying event instead of `find`'s oldest.
  const implants = input.events.filter((e) => e.eventType === "microchip_implanted");
  if (implants.some(clearsObligation)) {
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
  if (code || implants.length > 0) {
    return declaradaCard("microchip", "Microchip", FOOTNOTE.microchip, HINT.microchip, code);
  }
  // No chip on record. If the jurisdiction does not require one, there is no
  // obligation to surface — omit the card so it is not counted in "N de M".
  if (!applies) return null;
  return {
    key: "microchip",
    label: "Microchip",
    state: "Sin registro",
    tone: "neutral",
    detail: null,
    legalFootnote: FOOTNOTE.microchip,
  };
}

// es-AR nudge shown on the "PPP indeterminado" card. It names ONLY the fields
// actually missing — the projection receives the pet's free-text breed, so when
// a breed IS shown in the header the seal must never tell the owner to "completá
// la raza" (adversarial-citizen C1, 2026-07-06: a Boxer with a visible breed but
// no weight read "completá la raza y el peso", directly contradicting the
// header). Copy stays consistent with what's on screen.
function pppIndeterminadoHint(breedKnown: boolean, weightKnown: boolean): string {
  const missing: string[] = [];
  if (!breedKnown) missing.push("la raza");
  if (!weightKnown) missing.push("el peso");
  return `Completá ${missing.join(" y ")} para saber si tu mascota entra en el régimen PPP.`;
}

function breedIsKnown(breed: string | null | undefined): boolean {
  return typeof breed === "string" && breed.trim().length > 0;
}

// numeric() weights arrive as strings from the driver; a present, positive number
// counts as "known". Blank / 0 / null are all "not provided".
function weightIsKnown(value: number | string | null | undefined): boolean {
  if (value == null) return false;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value).trim());
  return Number.isFinite(n) && n > 0;
}

// The PPP obligation, with three outcomes:
//   1. `pppApplies` (the authoritative pet.potentiallyDangerousBreed flag, already
//      resolved against the jurisdiction's ppp_breed_list + ppp_weight_threshold)
//      -> the attestation card (required / attested).
//   2. Not flagged, DOG, and breed and/or weight missing -> "PPP indeterminado":
//      the pet cannot be ruled IN or OUT of the regime, so instead of hiding the
//      obligation we nudge the owner to complete the two deciding fields. Tone
//      `due` so it GRITA in the panel and does not count as "al día".
//   3. Not flagged, and (not a dog OR breed+weight both known) -> no card. A dog
//      with both fields known and no flag was genuinely classified as non-PPP;
//      cats and other species are never PPP.
function derivePpp(input: ComplianceInput): ObligationCard | null {
  if (input.pppApplies) {
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

  if (input.species !== "dog") return null;
  const breedKnown = breedIsKnown(input.breed);
  const weightKnown = weightIsKnown(input.estimatedWeightKg);
  if (breedKnown && weightKnown) return null;

  return {
    key: "ppp",
    label: "Régimen PPP",
    state: "Faltan datos",
    tone: "due",
    detail: null,
    legalFootnote: FOOTNOTE.ppp,
    hint: pppIndeterminadoHint(breedKnown, weightKnown),
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
 * credential is simply REGISTRADA. Lost, deceased and pregnancy override
 * compliance.
 *
 * Precedence matches PetCard.helpers (lost first, then deceased): a deceased
 * pet is a closed life record and must render the memorial state, NOT "AL DÍA"
 * (PJ-M1 — the mapper handled lost/pregnant but not deceased, so a deceased
 * fully-compliant pet read "al día" on every list row).
 *
 * This is THE single mapper for every surface that shows the chip (detail
 * header, /inicio registry, /mis-mascotas list) — QA round 2 (2026-07-03)
 * caught the same pet reading "AL DÍA" on the lists and "REGISTRADA · 0 de 3
 * al día" on its own header.
 */
export function lnPetStatusFromCompliance(
  pet: { status: string; pregnancyStatus: string | null },
  compliance: ComplianceState,
): "ok" | "registered" | "lost" | "pregnant" | "deceased" {
  if (pet.status === "lost") return "lost";
  if (pet.status === "deceased") return "deceased";
  if (pet.pregnancyStatus === "in_progress") return "pregnant";
  return compliance.summary.ok === compliance.summary.total ? "ok" : "registered";
}

/**
 * Compose the owner obligations into an ordered, summarized compliance view.
 * Cards are sorted worst-state first. The microchip card is omitted when the
 * jurisdiction does not require a chip (microchipApplies=false) and none is on
 * record. The PPP card is attestation when the pet is a flagged PPP,
 * "indeterminado" when a DOG is missing breed and/or weight, and omitted
 * otherwise (non-dog, or a dog with both fields known and no flag).
 */
export function deriveComplianceState(input: ComplianceInput): ComplianceState {
  const cards: ObligationCard[] = [deriveRabies(input), deriveSterilization(input)];
  const microchipCard = deriveMicrochip(input);
  if (microchipCard) {
    cards.push(microchipCard);
  }
  const pppCard = derivePpp(input);
  if (pppCard) {
    cards.push(pppCard);
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
