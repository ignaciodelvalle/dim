// Captura rápida — local keyword matcher (no LLM, no network).
//
// Takes free Spanish text from the owner and tries to match it to one
// of the 14 event-creation forms in EVENT_CAPTURE_REGISTRY. Returns a
// MatchResult with the resolved event_type, a confidence label, and
// any slot values it could extract (vaccine name, kg, microchip id,
// note body, date).
//
// Design constraints:
//   - 100% deterministic, runs client-side, no fetch.
//   - "Excellent match" path covers the high-frequency events
//     (vacuna, antiparasitario, peso, vet, microchip, esterilización,
//     fallecimiento, checkin, nota). The 5 complex forms (medicación
//     inicio/fin, mordedura, síntoma, clínico) match by trigger only
//     and return empty slots — the user fills in the form.
//   - First match wins. PATTERN order encodes priority — more specific
//     patterns come first (so "le di antirrábica" hits vaccine before
//     a generic "nota" catch-all).
//   - Negative matches (no trigger fired) return null so the UI can
//     show "no reconocemos eso".

import type { EventType } from "@/db/schema";

export type ConfidenceLabel = "high" | "medium" | "low";

export type MatchResult = {
  eventType: EventType;
  confidence: ConfidenceLabel;
  slots: Record<string, string>;
  /** The first trigger pattern that matched. Useful for debugging + tests. */
  matchedPattern: string;
  /**
   * Optional route override. When present, the caller uses this instead
   * of the registry's deeplink. Used by sub-flows of a single eventType
   * (e.g. pregnancy started vs ended both share `clinical_info_logged`
   * but live at `/eventos/nuevo/embarazo`).
   */
  routeOverride?: string;
};

type Pattern = {
  eventType: EventType;
  /** Triggers in priority order. First match wins. */
  triggers: RegExp[];
  /**
   * Per-slot regex extractors. Run against the full text, not just the
   * trigger match. Each one is optional — if the regex doesn't match
   * the slot is omitted (the form fills its own default).
   */
  slotExtractors?: Array<{ slot: string; pattern: RegExp; transform?: (m: string) => string }>;
  confidence?: ConfidenceLabel;
  /** Static route override appended to `/mis-mascotas/{publicToken}`. */
  routeOverride?: string;
};

// IMPORTANT: order matters. More specific patterns must come BEFORE
// catch-alls so "le di antirrábica" matches vacuna and not nota.
const PATTERNS: Pattern[] = [
  // Vacuna — recognized by the vaccine name itself or generic "vacuna".
  {
    eventType: "vaccination_administered",
    triggers: [
      /antirr[áa]bica/i,
      /\brabia\b/i,
      /\btriple\b/i,
      /polival(?:ente)?/i,
      /quintuple|quíntuple/i,
      /\bsextuple\b/i,
      /\bvacun/i,
    ],
    slotExtractors: [
      {
        slot: "vaccineName",
        pattern: /(antirr[áa]bica|rabia|triple|polival(?:ente)?|quintuple|quíntuple|sextuple)/i,
      },
    ],
    confidence: "high",
  },

  // Antiparasitario — pulgas, garrapatas, desparasitación.
  {
    eventType: "deworming_administered",
    triggers: [/antipar/i, /\bpulg/i, /garrap/i, /desparasit/i],
    confidence: "high",
  },

  // Peso — keep before "número genérico" patterns. Excellent slot fill.
  // Triggers cover: "peso", "pesa", "pesé", "pesamos", "pesaron", "pesaste".
  // We can't rely on `\b` after the verb because JS regex `\b` is ASCII-only
  // and "é" isn't a word character there — use an explicit lookahead instead.
  {
    eventType: "weight_recorded",
    triggers: [
      /\b(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?)\b/i,
      /(?:^|\s)pes(?:o|a|e|é|amos|aron|aste|aba|aban)(?=\s|[.,;:!?]|$)/i,
    ],
    slotExtractors: [
      {
        slot: "kg",
        // Group 1: the numeric value. Normalize comma → dot for the input.
        pattern: /(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?)/i,
        transform: (m) => m.replace(",", "."),
      },
    ],
    confidence: "high",
  },

  // Microchip.
  {
    eventType: "microchip_implanted",
    triggers: [/microchip/i, /\bchip\b/i],
    slotExtractors: [
      // 15-digit ISO 11784/11785. Rare in chat but support it.
      { slot: "chipNumber", pattern: /\b(\d{15})\b/ },
    ],
    confidence: "high",
  },

  // Esterilización.
  {
    eventType: "sterilization_performed",
    triggers: [/castr/i, /esteril/i, /orquiectom/i, /\bovariectom/i],
    confidence: "high",
  },

  // Mordedura / incidente — keep BEFORE the symptom catch-all because
  // "mordedura" is specific.
  {
    eventType: "incident_reported",
    triggers: [/\bmord/i, /\bataque\b/i, /\bse pele[oó]\b/i],
    confidence: "medium",
  },

  // Pregnancy — pair of started/ended sub-flows over clinical_info_logged.
  // Patterns checked BEFORE the symptom catch-all so "perdió el embarazo"
  // doesn't get classified as a generic symptom.
  // The deeplinks route to /eventos/nuevo/embarazo because pregnancy has
  // a dedicated form, not the generic clinical info form.
  {
    eventType: "clinical_info_logged",
    triggers: [
      /pari[óo]\s+(\d+)?/i,
      /tuvo\s+(\d+)?\s*(cachorr|cr[íi]as|gatit)/i,
      /nacieron\s+(\d+)?\s*(cachorr|cr[íi]as|gatit)/i,
    ],
    slotExtractors: [
      {
        slot: "liveBirthsCount",
        pattern: /(?:pari[óo]|tuvo|nacieron)\s+(\d+)/i,
      },
    ],
    confidence: "high",
    routeOverride: "/eventos/nuevo/embarazo?phase=ended&outcome=live_birth",
  },
  {
    eventType: "clinical_info_logged",
    triggers: [
      /perdi[óo]\s+(?:el\s+)?embarazo/i,
      /tuvo\s+un\s+aborto/i,
      /se\s+complic[óo]\s+el\s+embarazo/i,
    ],
    confidence: "high",
    routeOverride: "/eventos/nuevo/embarazo?phase=ended&outcome=miscarriage",
  },
  {
    eventType: "clinical_info_logged",
    triggers: [
      /est[áa]\s+embarazada/i,
      /est[áa]\s+pre[ñn]ada/i,
      /espera\s+(?:cachorr|cr[íi]as|gatit)/i,
      /panza\s+de\s+embaraz/i,
    ],
    confidence: "high",
    routeOverride: "/eventos/nuevo/embarazo?phase=started",
  },

  // Síntoma — vómitos, diarrea, fiebre, tos, etc. The catalog has 30+
  // symptoms; slot fill requires LLM so we just trigger the form.
  {
    eventType: "symptom_observed",
    triggers: [
      /\bv[óo]mit/i,
      /diarrea/i,
      /\bfiebre\b/i,
      /\btos\b/i,
      /estornud/i,
      /coje[ao]?/i,
      /no\s+come/i,
      /no\s+toma\s+agua/i,
      /letarg/i,
      /decaid[ao]/i,
      /s[íi]ntoma/i,
    ],
    confidence: "medium",
  },

  // Fallecimiento — antes de vet_visit_logged porque "falleció en la
  // clínica" debería matchear muerte, no visita.
  {
    eventType: "death_recorded",
    triggers: [/falleci[óo]/i, /muri[óo]/i, /se\s+fue\s+al\s+arcoiris/i, /cruz[óo]\s+el\s+puente/i],
    confidence: "high",
  },

  // Visita al vet.
  {
    eventType: "vet_visit_logged",
    triggers: [/\bvet\b/i, /veterinari/i, /\bconsulta\b/i, /\bcl[íi]nica\b/i, /\bcontrol\b/i],
    confidence: "high",
  },

  // Medicación inicio vs fin. The trigger order disambiguates — "termina"
  // / "termin[éo]" / "deja" point to stopped; otherwise default to started.
  {
    eventType: "medication_stopped",
    triggers: [
      // Tolerate any short connector (las / los / con la / etc.) between
      // the verb and the noun — natural Spanish doesn't always go bare.
      /termin[éo]\s+.{0,15}(?:medicaci[óo]n|tratamient)/i,
      /\bdej[éo]\s+.{0,15}(?:medic|pastilla|tratamient)/i,
      /\bfin\s+(?:del|de\s+la)\s+tratamient/i,
    ],
    confidence: "medium",
  },
  {
    eventType: "medication_started",
    triggers: [
      /empec[éo]\s+(?:el|la|con)?\s*(?:medicaci[óo]n|tratamient|pastilla|jarabe)/i,
      /\bmedicaci[óo]n\b/i,
      /\bantibiot/i,
      /\bjarabe\b/i,
      /\bpastill/i,
    ],
    confidence: "medium",
  },

  // Clínico — catch-all médico que no es síntoma puntual.
  {
    eventType: "clinical_info_logged",
    triggers: [
      /\bcl[íi]nic[oa]\b/i,
      /\bdiagn[óo]stic/i,
      /\bestudio\b/i,
      /\branalisis\b/i,
      /\branálisis\b/i,
      /\becograf/i,
      /\bradiograf/i,
    ],
    confidence: "low",
  },

  // Checkin post-adopción — explicit phrase.
  {
    eventType: "post_adoption_checkin",
    triggers: [/check[\s-]?in/i, /seguimient.*adopci[óo]n/i, /control.*post.?adopci[óo]n/i],
    confidence: "medium",
  },

  // Nota — final catch-all si nada anterior pegó pero el texto parece
  // narrativo. Más conservador: requiere "anot|nota" o no matchea nada.
  // El cuerpo de la nota es TODO el texto del usuario.
  {
    eventType: "note_added",
    triggers: [/\banot/i, /\bnota\b/i, /\brecordar?\b/i],
    slotExtractors: [
      // El cuerpo de la nota es el texto entero, sin la palabra "anotar:"
      // si está al inicio.
      {
        slot: "text",
        pattern: /^(?:anot[ao]r?\s*:?\s*|nota\s*:?\s*)?(.+)$/is,
      },
    ],
    confidence: "medium",
  },
];

/**
 * Resolve an `occurredAt` value from natural-language date phrases.
 * Returns a YYYY-MM-DD string suitable for `<input type="date">` or
 * null if no phrase matched (in which case the form's own `today`
 * default takes over).
 *
 * Supported:
 *  - "hoy"
 *  - "ayer"
 *  - "anteayer"
 *  - "hace N días"
 *  - "el DD/MM[/AAAA]" or "DD-MM-AAAA"
 *  - "el DD de {mes}"
 */
export function extractDateFromText(text: string, now: Date = new Date()): string | null {
  const lower = text.toLowerCase();

  if (/\bhoy\b/.test(lower)) return ymd(now);
  if (/\banteayer\b/.test(lower)) return ymd(addDays(now, -2));
  if (/\bayer\b/.test(lower)) return ymd(addDays(now, -1));

  // "hace N días"
  const hace = lower.match(/hace\s+(\d{1,3})\s+d[íi]as?/);
  if (hace) {
    const n = Number.parseInt(hace[1], 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 365) return ymd(addDays(now, -n));
  }

  // DD/MM/AAAA or DD-MM-AAAA
  const slash = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (slash) {
    const d = Number.parseInt(slash[1], 10);
    const m = Number.parseInt(slash[2], 10);
    let y = slash[3] ? Number.parseInt(slash[3], 10) : now.getFullYear();
    if (y < 100) y += 2000;
    if (validYMD(y, m, d)) return formatYMD(y, m, d);
  }

  // "el DD de {mes}"
  const months: Record<string, number> = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    setiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
  };
  const spanish = lower.match(/\b(\d{1,2})\s+de\s+([a-záéíóú]+)/);
  if (spanish) {
    const d = Number.parseInt(spanish[1], 10);
    const m = months[spanish[2]];
    if (m && validYMD(now.getFullYear(), m, d)) return formatYMD(now.getFullYear(), m, d);
  }

  return null;
}

/**
 * Run the matcher against a free-text input. Returns the first
 * pattern that fires, with whatever slots could be extracted. Returns
 * null if no pattern matched (UI should surface "no reconocemos eso").
 */
export function matchCaptureIntent(text: string): MatchResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const pattern of PATTERNS) {
    let firedTrigger: string | null = null;
    for (const trigger of pattern.triggers) {
      const m = trimmed.match(trigger);
      if (m) {
        firedTrigger = trigger.source;
        break;
      }
    }
    if (!firedTrigger) continue;

    const slots: Record<string, string> = {};
    if (pattern.slotExtractors) {
      for (const ex of pattern.slotExtractors) {
        const m = trimmed.match(ex.pattern);
        if (m?.[1]) {
          const value = ex.transform ? ex.transform(m[1]) : m[1];
          slots[ex.slot] = value.trim();
        }
      }
    }

    // Date extraction is shared across all event types whose registry
    // includes `occurredAt` — caller decides whether to use it via the
    // registry's prefillSlots.
    const date = extractDateFromText(trimmed);
    if (date) slots.occurredAt = date;

    return {
      eventType: pattern.eventType,
      confidence: pattern.confidence ?? "medium",
      slots,
      matchedPattern: firedTrigger,
      ...(pattern.routeOverride ? { routeOverride: pattern.routeOverride } : {}),
    };
  }

  return null;
}

// --- date helpers ----------------------------------------------------

function ymd(d: Date): string {
  return formatYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function formatYMD(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function validYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const test = new Date(y, m - 1, d);
  return test.getFullYear() === y && test.getMonth() === m - 1 && test.getDate() === d;
}
