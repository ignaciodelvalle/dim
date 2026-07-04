// Cross-border corridor reference data (movilidad-jurisdiccional Fase 1).
//
// Spec R3.1: corridor data lives in CODE (sibling to disease-legal-anchors.ts,
// same "not a database table, regulations change rarely" rationale),
// version-tracked by git history — NOT in govt_business_rules for Fase 1.
//
// Spec R3.3: EXACTLY 5 corridors exist — Chile, Uruguay, Brasil, UE-España,
// USA. The load-time coverage check below throws on any other registry
// content. This is the enforcement mechanism for "never a world engine":
// adding a 6th corridor requires editing assertCorridorCoverage, making scope
// creep visible in review, not silent.
//
// ⚠ REGULATORY DATA STATUS (PO gate — do not remove until resolved):
// Corridor requirement CONTENT (window days, wait days, quarantine, document
// lists) is regulatory data that needs source-cited validation by the product
// owner before it can be shipped. Fase 1 ships the corridor STRUCTURE with
// `rules: {}` (citation-pending) — values are intentionally EMPTY rather than
// fabricated. The aggregation surfaces an explicit "requisitos pendientes de
// validación oficial" warning for a corridor with no validated rules, so the
// semáforo can never read "verde" off missing data.
// TODO(PO): populate `rules` per corridor with per-value citations, bump
// `version` and `effectiveFrom` on each edit.

import type { TravelRuleType, TravelRuleValueByType } from "@/lib/domain/travel-strictness";

export const CORRIDOR_IDS = ["chile", "uruguay", "brasil", "ue_espana", "usa"] as const;
export type CorridorId = (typeof CORRIDOR_IDS)[number];

export type CorridorRules = { [K in TravelRuleType]?: TravelRuleValueByType[K] };

export interface Corridor {
  id: CorridorId;
  /** es-AR display name. */
  label: string;
  /** Destination descriptor. */
  jurisdiction: { country: string; region?: string };
  /** Bumped on ANY rule-value edit (spec R3.2). */
  version: string;
  /** ISO date — when this version's values took effect. */
  effectiveFrom: string;
  /** Citation for the authority/regulation this corridor encodes. */
  sourceUrl: string;
  /** Fase 1 is outbound-from-Argentina only (spec R3.4). */
  appliesTo: { species: readonly ("dog" | "cat")[]; direction: "outbound_from_ar" };
  rules: CorridorRules;
}

// Structure-only registry: version 2026.0 marks the citation-pending state.
// sourceUrl points at the destination authority responsible for the corridor's
// entry requirements (real agencies; exact regulation citations pending PO).
const STRUCTURE_VERSION = "2026.0";
const STRUCTURE_EFFECTIVE_FROM = "2026-07-04";
const SPECIES: readonly ("dog" | "cat")[] = ["dog", "cat"];

export const CORRIDORS: readonly Corridor[] = [
  {
    id: "chile",
    label: "Chile",
    jurisdiction: { country: "CL" },
    version: STRUCTURE_VERSION,
    effectiveFrom: STRUCTURE_EFFECTIVE_FROM,
    sourceUrl: "https://www.sag.gob.cl",
    appliesTo: { species: SPECIES, direction: "outbound_from_ar" },
    rules: {},
  },
  {
    id: "uruguay",
    label: "Uruguay",
    jurisdiction: { country: "UY" },
    version: STRUCTURE_VERSION,
    effectiveFrom: STRUCTURE_EFFECTIVE_FROM,
    sourceUrl: "https://www.gub.uy/ministerio-ganaderia-agricultura-pesca",
    appliesTo: { species: SPECIES, direction: "outbound_from_ar" },
    rules: {},
  },
  {
    id: "brasil",
    label: "Brasil",
    jurisdiction: { country: "BR" },
    version: STRUCTURE_VERSION,
    effectiveFrom: STRUCTURE_EFFECTIVE_FROM,
    sourceUrl: "https://www.gov.br/agricultura",
    appliesTo: { species: SPECIES, direction: "outbound_from_ar" },
    rules: {},
  },
  {
    id: "ue_espana",
    label: "Unión Europea (España)",
    jurisdiction: { country: "ES", region: "UE" },
    version: STRUCTURE_VERSION,
    effectiveFrom: STRUCTURE_EFFECTIVE_FROM,
    sourceUrl: "https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX%3A32013R0576",
    appliesTo: { species: SPECIES, direction: "outbound_from_ar" },
    rules: {},
  },
  {
    id: "usa",
    label: "Estados Unidos",
    jurisdiction: { country: "US" },
    version: STRUCTURE_VERSION,
    effectiveFrom: STRUCTURE_EFFECTIVE_FROM,
    sourceUrl: "https://www.cdc.gov/importation/dogs/index.html",
    appliesTo: { species: SPECIES, direction: "outbound_from_ar" },
    rules: {},
  },
];

/**
 * S8 hard bound: throws unless `corridors` contains EXACTLY the 5 registered
 * ids (no more, no fewer, no duplicates) and every corridor carries a
 * citation sourceUrl. Same throw-at-load pattern as disease-legal-anchors.ts.
 */
export function assertCorridorCoverage(corridors: readonly Corridor[]): void {
  const ids = corridors.map((c) => c.id);
  const expected = [...CORRIDOR_IDS].sort();
  const actual = [...ids].sort();
  if (
    actual.length !== expected.length ||
    actual.some((id, i) => id !== expected[i]) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error(
      `lib/reference/cross-border-corridors.ts: corridor registry must contain exactly {${expected.join(", ")}} — got {${ids.join(", ")}}. Fase 1 is 5 corridors ONLY (spec R3.3); a new corridor requires a spec update first.`,
    );
  }
  const missingSource = corridors.filter(
    (c) => !c.sourceUrl || !c.sourceUrl.startsWith("https://"),
  );
  if (missingSource.length > 0) {
    throw new Error(
      `lib/reference/cross-border-corridors.ts: corridor(s) without a citation sourceUrl: ${missingSource.map((c) => c.id).join(", ")}`,
    );
  }
}

export function getCorridor(id: CorridorId): Corridor {
  const corridor = CORRIDORS.find((c) => c.id === id);
  if (!corridor) {
    // Unreachable while the load-time check holds; kept as a hard failure so
    // a future regression cannot silently return undefined.
    throw new Error(`Unknown corridor id: ${id}`);
  }
  return corridor;
}

// Static load-time check (S8) — mirrors disease-legal-anchors.ts.
void assertCorridorCoverage(CORRIDORS);
