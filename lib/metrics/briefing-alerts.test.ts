// Unit tests for lib/metrics/briefing-alerts.ts — PURE, DB-free (C6b).
//
// Pins the briefing engine's guards to the same red-team classes C1 already
// fences at the tile level (docs/reviews/results/2026-07-22-plan-maestro-
// integridad.md, §C6): an alert must never fire from unmeasurable data, a
// semaphore that refuses a legal-verdict tone, or a met target — and the
// ranked list is always capped at 5.

import { describe, expect, it } from "vitest";

import {
  type BriefingAlertCandidate,
  MAX_BRIEFING_ALERTS,
  type SurveillanceUrgencyCandidate,
  buildBriefingAlerts,
  deriveAlertConfidence,
} from "./briefing-alerts";
import { KPI_CATALOG } from "./kpi-catalog";

describe("buildBriefingAlerts — guard exclusions", () => {
  it("never alerts a KPI with no target (no gap to compute)", () => {
    // bites_per_10k has no `target`/`semaphore` at all.
    const candidates: BriefingAlertCandidate[] = [{ kpiId: "bites_per_10k", value: 40, n: 100 }];
    expect(buildBriefingAlerts(candidates)).toEqual([]);
  });

  it("never alerts a KPI whose semaphore explicitly refuses a legal-verdict tone", () => {
    // ppp_registry_compliance HAS a target (100) but semaphore: {paintAgainst: "none"}.
    expect(KPI_CATALOG.ppp_registry_compliance.target).toBeDefined();
    expect(KPI_CATALOG.ppp_registry_compliance.semaphore?.paintAgainst).toBe("none");
    const candidates: BriefingAlertCandidate[] = [
      { kpiId: "ppp_registry_compliance", value: 0, n: 20 },
    ];
    expect(buildBriefingAlerts(candidates)).toEqual([]);
  });

  it("never alerts on a zero-denominator (unmeasurable) reading", () => {
    // mortality_disposal_traceability declares guards.zeroDenominator: 'dash'.
    const candidates: BriefingAlertCandidate[] = [
      { kpiId: "mortality_disposal_traceability", value: 0, n: 0 },
    ];
    expect(buildBriefingAlerts(candidates)).toEqual([]);
  });

  it("never alerts on a small-N sample even when the gap looks large", () => {
    // mortality_disposal_traceability declares guards.smallN.min = 5.
    const candidates: BriefingAlertCandidate[] = [
      { kpiId: "mortality_disposal_traceability", value: 0, n: 2 },
    ];
    expect(buildBriefingAlerts(candidates)).toEqual([]);
  });

  it("never alerts when the value already meets or beats the target", () => {
    const candidates: BriefingAlertCandidate[] = [
      { kpiId: "rabies_coverage_dogs_12m", value: 85, n: 500 },
    ];
    expect(buildBriefingAlerts(candidates)).toEqual([]);
  });

  it("drops a candidate whose KPI has no registered owning screen", () => {
    // custody_return_rate DOES have a target + semaphore:target, so it clears
    // every guard above — but it's a lower-is-better ratio the engine
    // deliberately does not register an action for (see the module header:
    // this engine's gap/tone math assumes higher-is-better). Confirms the
    // "no owning screen" branch drops it instead of fabricating a link.
    expect(KPI_CATALOG.custody_return_rate.target).toBeDefined();
    expect(KPI_CATALOG.custody_return_rate.semaphore?.paintAgainst).toBe("target");
    const candidates: BriefingAlertCandidate[] = [
      { kpiId: "custody_return_rate", value: 5, n: 50 },
    ];
    expect(buildBriefingAlerts(candidates)).toEqual([]);
  });
});

describe("buildBriefingAlerts — a real gap produces an alert", () => {
  it("produces an alert carrying title/evidence/severity/confidence/action for a real gap", () => {
    const candidates: BriefingAlertCandidate[] = [
      { kpiId: "mortality_disposal_traceability", value: 33, n: 12 },
    ];
    const alerts = buildBriefingAlerts(candidates);
    expect(alerts).toHaveLength(1);
    const [alert] = alerts;
    expect(alert.id).toBe("mortality_disposal_traceability");
    // Rounding-drift fix (qa-triage-2026-07-23 finding #6): the alert's value
    // routes through the SAME 1-decimal formatPercent every KPI tile uses —
    // an exact 33 renders "33,0%", never a bare 0-decimal "33%" that could
    // silently disagree with a tile showing e.g. "33,7%" for the same metric.
    expect(alert.title).toContain("33,0%");
    // C1 fix (claim #6, cursor red-team 2026-07-23): a law-sourced but
    // non-statutory target renders as "Obligación: <ley> · Meta programática:
    // X%" — NOT "meta X% (<ley>)", which reads as if the law set the number.
    expect(alert.title).toContain("Meta programática: 75%");
    expect(alert.title).toContain("Obligación: Ley CABA 5470");
    expect(alert.evidence).toEqual({
      value: 33,
      target: 75,
      unit: "percent",
      n: 12,
      source: "Ley CABA 5470",
    });
    expect(alert.actionHref).toBe("/gob/mortalidad");
    expect(alert.actionLabel).toBe("Ver en Mortalidad y disposición");
    // 33 vs target 75 with the default 50% warn band → 75*0.5=37.5, 33 < 37.5 → danger.
    expect(alert.severity).toBe("alta");
  });
});

// Cursor red-team 2026-07-23 (claim #4): "Panel calm (0 obs, 0 open bites) vs
// Vigilancia gap (14 reports vs 0 obs, 3 past 10-day deadline)" — the
// briefing never surfaced real surveillance urgency. These two candidates are
// NOT target-gap shaped (bite_escalation_gap and the deadline-breach count
// are deliberately non-ratio, semaphore:none) — a separate honest path.
describe("buildBriefingAlerts — surveillance urgency signals (claim #4)", () => {
  it("never fabricates an escalation-gap alert on a genuine 0/0 (no bites at all)", () => {
    const signals: SurveillanceUrgencyCandidate[] = [
      { kind: "escalation_gap", bites12m: 0, openObservations: 0 },
    ];
    expect(buildBriefingAlerts([], signals)).toEqual([]);
  });

  it("does not alert the escalation gap when observations ARE open (no gap)", () => {
    const signals: SurveillanceUrgencyCandidate[] = [
      { kind: "escalation_gap", bites12m: 14, openObservations: 2 },
    ];
    expect(buildBriefingAlerts([], signals)).toEqual([]);
  });

  it("fires the escalation-gap alert on a real gap (bites reported, zero observations open)", () => {
    const signals: SurveillanceUrgencyCandidate[] = [
      { kind: "escalation_gap", bites12m: 14, openObservations: 0 },
    ];
    const [alert] = buildBriefingAlerts([], signals);
    expect(alert.id).toBe("bite_escalation_gap");
    expect(alert.title).toContain("14 mordeduras");
    expect(alert.title).toContain("0 observaciones abiertas");
    expect(alert.severity).toBe("media");
    expect(alert.actionHref).toBe("/gob/vigilancia");
  });

  it("never fabricates a deadline-breach alert when openBreaches is 0", () => {
    const signals: SurveillanceUrgencyCandidate[] = [{ kind: "deadline_breach", openBreaches: 0 }];
    expect(buildBriefingAlerts([], signals)).toEqual([]);
  });

  it("fires the deadline-breach alert with 'alta' severity — a live legal-deadline miss", () => {
    const signals: SurveillanceUrgencyCandidate[] = [{ kind: "deadline_breach", openBreaches: 3 }];
    const [alert] = buildBriefingAlerts([], signals);
    expect(alert.id).toBe("rabies_observation_compliance_10d");
    expect(alert.title).toContain("3 observaciones rábicas superan");
    expect(alert.title).toContain("plazo legal de 10 días");
    expect(alert.severity).toBe("alta");
    expect(alert.actionHref).toBe("/gob/vigilancia");
  });

  it("merges urgency signals into the SAME ranked/capped list as target-gap alerts, alta before media", () => {
    const candidates: BriefingAlertCandidate[] = [
      { kpiId: "mortality_disposal_traceability", value: 33, n: 12 }, // alta
    ];
    const signals: SurveillanceUrgencyCandidate[] = [
      { kind: "escalation_gap", bites12m: 14, openObservations: 0 }, // media
      { kind: "deadline_breach", openBreaches: 3 }, // alta
    ];
    const alerts = buildBriefingAlerts(candidates, signals);
    expect(alerts).toHaveLength(3);
    expect(alerts.filter((a) => a.severity === "alta")).toHaveLength(2);
    expect(alerts[alerts.length - 1].severity).toBe("media");
  });
});

describe("buildBriefingAlerts — ranking", () => {
  it("ranks severity (alta) before severity (media), then by gap size within a tier", () => {
    const candidates: BriefingAlertCandidate[] = [
      // warn tier: 75*0.5=37.5 <= value < 75 → media. gap = 75-60 = 15.
      { kpiId: "mortality_disposal_traceability", value: 60, n: 12 },
      // danger tier: value < 40 (80*0.5) → alta. gap = 80-20 = 60 (larger gap).
      { kpiId: "rabies_coverage_dogs_12m", value: 20, n: 500 },
      // danger tier: value < 40 (80*0.5) → alta. gap = 80-30 = 50.
      { kpiId: "microchip_penetration", value: 30, n: 500 },
    ];
    const alerts = buildBriefingAlerts(candidates);
    expect(alerts.map((a) => a.id)).toEqual([
      "rabies_coverage_dogs_12m", // alta, gap 60
      "microchip_penetration", // alta, gap 50
      "mortality_disposal_traceability", // media, gap 15
    ]);
    expect(alerts.map((a) => a.severity)).toEqual(["alta", "alta", "media"]);
  });

  it("caps the ranked list at MAX_BRIEFING_ALERTS (5)", () => {
    const candidates: BriefingAlertCandidate[] = [
      { kpiId: "rabies_coverage_dogs_12m", value: 10, n: 500 },
      { kpiId: "microchip_penetration", value: 10, n: 500 },
      { kpiId: "mortality_disposal_traceability", value: 10, n: 20 },
      { kpiId: "reunification_rate", value: 5, n: 20 },
      { kpiId: "rabies_observation_compliance_10d", value: 10, n: 20 },
      { kpiId: "campaign_completion_rate", value: 10, n: 20 },
      { kpiId: "eno_sla_compliance", value: 10, n: 20 },
    ];
    expect(candidates.length).toBeGreaterThan(MAX_BRIEFING_ALERTS);
    const alerts = buildBriefingAlerts(candidates);
    expect(alerts).toHaveLength(MAX_BRIEFING_ALERTS);
  });
});

describe("buildBriefingAlerts — resourceLine (PO decision 2, item 2)", () => {
  it("appends 'faltan ~N {unit}' when the descriptor names a resourceUnit", () => {
    expect(KPI_CATALOG.microchip_penetration.resourceUnit).toBe("chips");
    const candidates: BriefingAlertCandidate[] = [
      { kpiId: "microchip_penetration", value: 20, n: 500 },
    ];
    const [alert] = buildBriefingAlerts(candidates);
    // (80-20)/100 * 500 = 300
    expect(alert.evidence.resourceLine).toBe("faltan ~300 chips sobre el padrón registrado");
  });

  it("never fabricates a resourceLine for a descriptor without a resourceUnit", () => {
    expect(KPI_CATALOG.mortality_disposal_traceability.resourceUnit).toBeUndefined();
    const candidates: BriefingAlertCandidate[] = [
      { kpiId: "mortality_disposal_traceability", value: 33, n: 12 },
    ];
    const [alert] = buildBriefingAlerts(candidates);
    expect(alert.evidence.resourceLine).toBeUndefined();
  });

  it("never alerts at all when n is 0 (zeroDenominator guard, red-team 2026-07 #3)", () => {
    const candidates: BriefingAlertCandidate[] = [
      { kpiId: "microchip_penetration", value: 20, n: 0 },
    ];
    // microchip_penetration now declares guards.zeroDenominator ("dash") —
    // a 0/0 padrón (e.g. an out-of-mandate locality filter) must never
    // surface a "Confianza: alta · n = 0" briefing alert.
    expect(KPI_CATALOG.microchip_penetration.guards?.zeroDenominator).toBe("dash");
    expect(buildBriefingAlerts(candidates)).toHaveLength(0);
  });
});

describe("deriveAlertConfidence", () => {
  const withSmallN = { guards: { smallN: { min: 5 } } };

  it("returns 'baja' when n sits under 2x the smallN floor (guard didn't fire, but still thin)", () => {
    expect(deriveAlertConfidence(withSmallN, { n: 6 })).toBe("baja");
    expect(deriveAlertConfidence(withSmallN, { n: 9 })).toBe("baja");
  });

  it("returns 'alta' once n comfortably clears 2x the smallN floor, with a confidence input declared", () => {
    expect(deriveAlertConfidence({ ...withSmallN, confidence: { inputs: ["x"] } }, { n: 10 })).toBe(
      "alta",
    );
  });

  it("returns 'media' when a declared secondary input is explicitly absent", () => {
    expect(
      deriveAlertConfidence(
        { confidence: { inputs: ["census row"] } },
        { n: 500, auxPresent: false },
      ),
    ).toBe("media");
  });

  it("returns 'media' when the descriptor's caveat flags seed-thin data", () => {
    expect(
      deriveAlertConfidence(
        { confidence: { inputs: ["x"] }, caveat: "SEED-DENSITY CAVEAT: low density." },
        { n: 500 },
      ),
    ).toBe("media");
  });

  it("returns 'media' when the descriptor has no confidence prose at all — never overclaims 'alta'", () => {
    expect(deriveAlertConfidence({}, { n: 500 })).toBe("media");
  });

  it("returns 'alta' for a comfortable sample with documented confidence and no caveats", () => {
    expect(deriveAlertConfidence({ confidence: { inputs: ["x"] } }, { n: 500 })).toBe("alta");
  });
});
