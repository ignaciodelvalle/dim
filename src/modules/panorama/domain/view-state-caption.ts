// Panorama ViewState — "explain this view" (task #50 P5 gift, proof-of-value).
//
// `explainViewState(view)` turns the canonical value into one honest es-AR
// sentence describing the WHOLE view — the preset, the scope, the window, the
// scrub cut + basis, the verified filter, and the active layers. This is the
// "Copiar vista" / export description the PO wants, and it is the PROOF that the
// P1a value is complete: a ViewState is fully describable in words BECAUSE every
// surface projects from it. If a field could not be described here, it would be a
// hidden coordinate — the thing this refactor exists to abolish.
//
// Complements `captionFor` (which describes ONE layer's encoding on the map);
// this describes the whole selection. Pure — NO @/db, NO next, NO React.
//
// es-AR user copy, English identifiers (project invariant #4).

import { getLayer } from "./layers";
import { getPreset } from "./presets";
import type { AggregationLevel } from "./types";
import type { PanoramaViewState } from "./view-state";

/** Optional display-name resolvers — the console has the human province/locality
 *  names (the ViewState stores ISO codes). Absent → the code is shown as-is. */
export type ExplainNames = {
  provinceLabel?: (code: string) => string | undefined;
  localityLabel?: (province: string, locality: string) => string | undefined;
  /**
   * Honesty override for a BOUNDED operator. A govt operator with no explicit
   * drill still carries a `national` ViewState scope — but their DATA is scoped
   * to their assigned jurisdiction(s) by the loaders. Naming the nation
   * ("Argentina (todas las provincias)") would lie about the projection
   * geography. Pass the honest jurisdiction label (e.g. "Tierra del Fuego, Santa
   * Cruz, CABA") and it replaces the national phrase.
   */
  boundedScopeLabel?: string;
  /**
   * The administrative grain the MAP is currently rendering. When the scope is
   * national but the map has auto-disaggregated to department grain, the national
   * phrase is qualified ("Argentina · nivel departamento") so the footer never
   * implies a province-level "todas las provincias" over a department choropleth.
   * Ignored once `boundedScopeLabel` applies or the scope is province/locality.
   */
  renderLevel?: AggregationLevel;
};

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const PERIOD_PHRASE: Record<string, string> = {
  "7d": "últimos 7 días",
  "30d": "últimos 30 días",
  "90d": "últimos 90 días",
  ytd: "en lo que va del año",
  trailing12m: "últimos 12 meses",
  "3y": "últimos 3 años",
  "5y": "últimos 5 años",
};

/** "1 de mayo de 2026" from an ISO timestamp; the raw string if unparseable. */
function formatSpanishDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} de ${MONTHS_ES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function scopePhrase(view: PanoramaViewState, names?: ExplainNames): string {
  switch (view.scope.kind) {
    case "national":
      // A bounded operator's data is narrower than the nation — name their real
      // jurisdiction instead of claiming "todas las provincias" (Finding #1).
      if (names?.boundedScopeLabel) return names.boundedScopeLabel;
      // National scope but the map disaggregated to department grain — qualify the
      // phrase so it never contradicts the on-screen grain (Finding #1, admin).
      if (names?.renderLevel === "locality") return "Argentina · nivel departamento";
      return "Argentina (todas las provincias)";
    case "province": {
      const label = names?.provinceLabel?.(view.scope.province) ?? view.scope.province;
      return label;
    }
    case "locality": {
      const prov = names?.provinceLabel?.(view.scope.province) ?? view.scope.province;
      const loc =
        names?.localityLabel?.(view.scope.province, view.scope.locality) ?? view.scope.locality;
      return `${loc}, ${prov}`;
    }
  }
}

function periodPhrase(view: PanoramaViewState): string {
  if (view.period.kind === "custom") {
    return `del ${formatSpanishDate(view.period.from)} al ${formatSpanishDate(view.period.to)}`;
  }
  return PERIOD_PHRASE[view.period.preset] ?? view.period.preset;
}

/** The active-layer labels in activation order (unknown ids skipped). */
function layerLabels(view: PanoramaViewState): string[] {
  return view.layers.map((id) => getLayer(id)?.label).filter((l): l is string => l !== undefined);
}

/**
 * Build the one-line es-AR description of the whole view. Structure:
 *
 *   "{Preset label o 'Vista personalizada'} — {scope}, {período}[, al {fecha}
 *    (tiempo de {validez|transacción})][, solo con firma veterinaria].
 *    Capas: {labels}."
 *
 * Every ViewState field that changes what the operator sees appears here — since
 * P5 that includes an explicit encoding selection (it round-trips the URL). The
 * remaining ephemerals (basis default, representation=dock tab) do not, because
 * they do not change the DATA in view — only how the current surface presents it.
 */
export function explainViewState(view: PanoramaViewState, names?: ExplainNames): string {
  const preset = view.preset ? getPreset(view.preset) : undefined;
  const head = preset?.label ?? "Vista personalizada";

  const parts: string[] = [`${scopePhrase(view, names)}, ${periodPhrase(view)}`];

  if (view.asOf !== null) {
    const basisPhrase = view.basis === "transaction" ? "transacción" : "validez";
    parts.push(`al ${formatSpanishDate(view.asOf)} (tiempo de ${basisPhrase})`);
  }

  if (view.verifiedOnly) {
    parts.push("solo con firma veterinaria");
  }

  // P5: encoding became a shareable coordinate (?encoding= round-trips), so an
  // explicit selection is part of what the link reproduces — say it.
  if (view.encoding === "bivariate") {
    parts.push("riesgo combinado (bivariado)");
  }

  const labels = layerLabels(view);
  const layersClause = labels.length > 0 ? ` Capas: ${labels.join(", ")}.` : "";

  return `${head} — ${parts.join(", ")}.${layersClause}`;
}
