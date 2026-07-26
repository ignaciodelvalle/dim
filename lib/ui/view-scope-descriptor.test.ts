// lib/ui/view-scope-descriptor.test.ts — the REPRODUCIBILITY proof for V2.
//
// This file is the deliverable, not the decoration. Everything else in V2 is a
// promise ("an export carries enough to regenerate what somebody signed"); this
// is where the promise is kept or broken.
//
// The three obligations, in order of how badly a failure hurts:
//
//  1. ROUND-TRIP — a serialized descriptor reconstructs the view and the SAME
//     values come out (the view state, and every es-AR description of it).
//  2. DIVERGENCE — mutating the source view CHANGES the serialization. Without
//     this, obligation 1 is satisfiable by a descriptor that stores nothing.
//     The headline case is the C3 subtlety: a whole-province mandate drilled to
//     one locality inside it has the SAME jurisdiction COUNT as the mandate and
//     a strictly FINER grain, so a descriptor built on length collapses two
//     genuinely different views into one payload.
//  3. PRIVACY — the serialized key set is closed. Scope names jurisdictions,
//     never people.

import { describe, expect, it } from "vitest";

import { describeMandate } from "@/lib/ui/scope-chrome";
import { describeNarrowedView } from "@/lib/ui/view-scope-caption";
import {
  CSV_SCOPE_PREFIX,
  VIEW_SCOPE_SERIALIZED_KEYS,
  type ViewScopeAuthority,
  describeViewScope,
  isNarrowedBelowMandate,
  makeViewScopeDescriptor,
  parseViewScope,
  parseViewScopeFromCsv,
  serializeViewScope,
  toPanoramaViewState,
  viewScopeCsvHeaderLines,
  viewScopeDigest,
} from "@/lib/ui/view-scope-descriptor";
import {
  type PanoramaViewState,
  makeViewState,
  toPeriodSearchParams,
  toScopeFilter,
} from "@/src/modules/panorama/domain/view-state";
import { explainViewState } from "@/src/modules/panorama/domain/view-state-caption";

// The CABA case, exactly as `narrowGovtScope` produces it (lib/domain/
// jurisdiction-canonical.ts): the mandate is the two-tier whole-province entry,
// and the ?locality=Palermo drill replaces it with a SPECIFIC pair. Same
// length, different set.
const CABA_MANDATE = [{ province: "Ciudad Autónoma de Buenos Aires", locality: "" }];
const CABA_DRILLED = [{ province: "Ciudad Autónoma de Buenos Aires", locality: "Palermo" }];

const GOVT_WHOLE_PROVINCE: ViewScopeAuthority = {
  role: "govt",
  mandate: CABA_MANDATE,
  effective: CABA_MANDATE,
  adminDrill: null,
};

const GOVT_DRILLED_TO_PALERMO: ViewScopeAuthority = {
  role: "govt",
  mandate: CABA_MANDATE,
  effective: CABA_DRILLED,
  adminDrill: null,
};

function viewOf(over: Partial<PanoramaViewState> = {}): PanoramaViewState {
  return makeViewState({
    scope: { kind: "province", province: "Ciudad Autónoma de Buenos Aires" },
    period: { kind: "preset", preset: "90d" },
    asOf: "2026-05-01T00:00:00.000Z",
    basis: "valid",
    layers: ["perdidas"],
    verifiedOnly: false,
    preset: "bienestar",
    encoding: null,
    ...over,
  });
}

describe("ViewScopeDescriptor · reproducibility", () => {
  it("round-trips a serialized descriptor back into the same view state", () => {
    const source = viewOf();
    const descriptor = makeViewScopeDescriptor({
      authority: GOVT_DRILLED_TO_PALERMO,
      view: source,
      grain: "locality",
      generatedAt: new Date("2026-07-26T12:00:00.000Z"),
    });

    const rebuilt = toPanoramaViewState(parseViewScope(serializeViewScope(descriptor)));

    // Every field that changes a NUMBER survives the trip.
    expect(rebuilt.scope).toEqual(source.scope);
    expect(rebuilt.period).toEqual(source.period);
    expect(rebuilt.asOf).toBe(source.asOf);
    expect(rebuilt.basis).toBe(source.basis);
    expect(rebuilt.layers).toEqual(source.layers);
    expect(rebuilt.verifiedOnly).toBe(source.verifiedOnly);
    expect(rebuilt.preset).toBe(source.preset);
    expect(rebuilt.encoding).toBe(source.encoding);

    // …and so do the two projections the LOADERS actually consume, which is the
    // only reason a round-tripped scope is worth anything.
    expect(toScopeFilter(rebuilt)).toEqual(toScopeFilter(source));
    expect(toPeriodSearchParams(rebuilt)).toEqual(toPeriodSearchParams(source));
  });

  it("regenerates the same es-AR descriptions from the artifact alone", () => {
    const source = viewOf();
    const descriptor = makeViewScopeDescriptor({
      authority: GOVT_DRILLED_TO_PALERMO,
      view: source,
      grain: "locality",
    });

    const rebuilt = parseViewScope(serializeViewScope(descriptor));

    // The one-line view sentence — the caption every artifact prints.
    expect(explainViewState(toPanoramaViewState(rebuilt))).toBe(explainViewState(source));

    // The scope vocabulary is the C3 builders', not a second one invented here.
    expect(describeViewScope(rebuilt)).toEqual({
      mandate: describeMandate(CABA_MANDATE),
      narrowed: describeNarrowedView({
        role: "govt",
        mandateJurisdictions: CABA_MANDATE,
        effectiveJurisdictions: CABA_DRILLED,
      }),
    });
  });

  it("survives a jurisdiction list handed over in a different order", () => {
    const a: ViewScopeAuthority = {
      role: "govt",
      mandate: [
        { province: "Córdoba", locality: "Villa María" },
        { province: "Córdoba", locality: "Río Cuarto" },
      ],
      effective: [
        { province: "Córdoba", locality: "Villa María" },
        { province: "Córdoba", locality: "Río Cuarto" },
      ],
      adminDrill: null,
    };
    const b: ViewScopeAuthority = {
      role: "govt",
      mandate: [...a.mandate].reverse(),
      effective: [...a.effective].reverse(),
      adminDrill: null,
    };
    const view = viewOf();
    const da = makeViewScopeDescriptor({ authority: a, view, grain: "locality" });
    const db = makeViewScopeDescriptor({ authority: b, view, grain: "locality" });

    // Same view, same bytes — artifact identity must not depend on a row order.
    expect(serializeViewScope(da)).toBe(serializeViewScope(db));
    expect(viewScopeDigest(da)).toBe(viewScopeDigest(db));
  });

  it("keeps the digest stable across two exports of one view", () => {
    const view = viewOf();
    const morning = makeViewScopeDescriptor({
      authority: GOVT_DRILLED_TO_PALERMO,
      view,
      grain: "locality",
      generatedAt: "2026-07-26T09:00:00.000Z",
    });
    const afternoon = makeViewScopeDescriptor({
      authority: GOVT_DRILLED_TO_PALERMO,
      view,
      grain: "locality",
      generatedAt: "2026-07-26T17:30:00.000Z",
    });

    // A CSV and a PNG cut hours apart from the SAME board must prove they
    // describe one question — so generatedAt sits outside the digest.
    expect(viewScopeDigest(morning)).toBe(viewScopeDigest(afternoon));
    expect(serializeViewScope(morning)).not.toBe(serializeViewScope(afternoon));
  });
});

describe("ViewScopeDescriptor · divergence (the C3 subtlety)", () => {
  it("serializes a whole-province mandate DIFFERENTLY from the same mandate drilled to one locality", () => {
    const view = viewOf();
    // GRAIN IS HELD CONSTANT on purpose. In the wild these two views also differ
    // in rendered grain, and letting that difference into the fixture would make
    // the assertion pass for the WRONG reason — a descriptor that stored only a
    // jurisdiction COUNT would still diverge on grain and look correct. Pinning
    // grain forces the assertion to rest on the jurisdictions alone. (Verified:
    // with a count-only `effective` these two DID diverge on grain, and this
    // test was green while the descriptor was broken.)
    const whole = makeViewScopeDescriptor({
      authority: GOVT_WHOLE_PROVINCE,
      view,
      grain: "locality",
    });
    const drilled = makeViewScopeDescriptor({
      authority: GOVT_DRILLED_TO_PALERMO,
      view,
      grain: "locality",
    });

    // The trap: SAME jurisdiction count on both sides. A descriptor keyed on
    // length — or one that stored only `effective`, or only `mandate` — would
    // emit identical payloads here and reproduce the wrong view.
    expect(whole.authority.effective).toHaveLength(drilled.authority.effective.length);
    expect(whole.view).toEqual(drilled.view);
    expect(serializeViewScope(whole)).not.toBe(serializeViewScope(drilled));
    expect(viewScopeDigest(whole)).not.toBe(viewScopeDigest(drilled));

    // And the descriptor knows WHICH of the two it is.
    expect(isNarrowedBelowMandate(whole)).toBe(false);
    expect(isNarrowedBelowMandate(drilled)).toBe(true);
  });

  it("diverges when the source view is mutated after serialization", () => {
    const source = viewOf();
    const before = serializeViewScope(
      makeViewScopeDescriptor({
        authority: GOVT_DRILLED_TO_PALERMO,
        view: source,
        grain: "locality",
      }),
    );

    // One mutation per coordinate that changes what an operator SEES. Each must
    // move the bytes; a coordinate that does not is a coordinate the artifact
    // cannot reproduce.
    const mutations: Array<[string, Partial<PanoramaViewState>]> = [
      ["scope", { scope: { kind: "province", province: "Córdoba" } }],
      ["period", { period: { kind: "preset", preset: "7d" } }],
      ["asOf", { asOf: "2026-06-01T00:00:00.000Z" }],
      ["basis", { basis: "transaction" }],
      ["layers", { layers: ["perdidas", "denuncias"] }],
      ["verifiedOnly", { verifiedOnly: true }],
      ["encoding", { encoding: "bivariate" }],
      ["preset", { preset: "sintomas" }],
    ];
    for (const [name, over] of mutations) {
      const after = serializeViewScope(
        makeViewScopeDescriptor({
          authority: GOVT_DRILLED_TO_PALERMO,
          view: viewOf(over),
          grain: "locality",
        }),
      );
      expect(after, `mutating ${name} must change the serialized scope`).not.toBe(before);
    }

    // The rendered GRAIN is not a ViewState field — it is derived at runtime
    // from scope + zoom — so it must be carried explicitly or the same URL
    // reproduces a province choropleth where a department one was signed.
    const coarser = serializeViewScope(
      makeViewScopeDescriptor({
        authority: GOVT_DRILLED_TO_PALERMO,
        view: source,
        grain: "province",
      }),
    );
    expect(coarser, "mutating grain must change the serialized scope").not.toBe(before);

    // And the authority half: same view, different asker, different artifact.
    const asAdmin = serializeViewScope(
      makeViewScopeDescriptor({
        authority: {
          role: "admin",
          mandate: [],
          effective: [],
          adminDrill: { province: "Ciudad Autónoma de Buenos Aires", locality: "Palermo" },
        },
        view: source,
        grain: "locality",
      }),
    );
    expect(asAdmin, "a different authority must change the serialized scope").not.toBe(before);
  });

  it("refuses a descriptor from a version it cannot read", () => {
    const d = makeViewScopeDescriptor({
      authority: GOVT_WHOLE_PROVINCE,
      view: viewOf(),
      grain: "province",
    });
    const foreign = serializeViewScope(d).replace('"v":1', '"v":99');
    // Refusing beats defaulting: a half-understood scope would let a
    // reproduction claim fidelity it does not have.
    expect(() => parseViewScope(foreign)).toThrow(/unsupported version/);
  });
});

describe("ViewScopeDescriptor · CSV carriage", () => {
  it("round-trips through an exported CSV's header block", () => {
    const d = makeViewScopeDescriptor({
      authority: GOVT_DRILLED_TO_PALERMO,
      view: viewOf(),
      grain: "locality",
      generatedAt: "2026-07-26T12:00:00.000Z",
    });
    const csv = [...viewScopeCsvHeaderLines(d), "Capa,Unidad,Valor", "Pérdidas,Palermo,12"].join(
      "\r\n",
    );

    expect(parseViewScopeFromCsv(csv)).toEqual(d);
    // The block sits ABOVE the column header, so a truncated read still carries
    // its provenance.
    expect(csv.indexOf(CSV_SCOPE_PREFIX)).toBeLessThan(csv.indexOf("Capa,Unidad,Valor"));
    // Human lines use the C3 vocabulary — no second wording invented for files.
    expect(csv).toContain(`# miMAR · vista: ${describeViewScope(d).narrowed}`);
  });

  it("reads a scope-less CSV as ABSENT, not as a wrong scope", () => {
    expect(parseViewScopeFromCsv("Capa,Unidad,Valor\r\nPérdidas,Palermo,12")).toBeNull();
  });
});

describe("ViewScopeDescriptor · privacy", () => {
  it("serializes a closed key set — jurisdictions, never people", () => {
    const d = makeViewScopeDescriptor({
      authority: GOVT_DRILLED_TO_PALERMO,
      view: viewOf({ period: { kind: "custom", from: "2026-01-01", to: "2026-06-30" } }),
      grain: "locality",
      generatedAt: "2026-07-26T12:00:00.000Z",
    });

    const seen = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const v of value) walk(v);
        return;
      }
      if (typeof value === "object" && value !== null) {
        for (const [k, v] of Object.entries(value)) {
          seen.add(k);
          walk(v);
        }
      }
    };
    walk(JSON.parse(serializeViewScope(d)));

    const unexpected = [...seen].filter((k) => !VIEW_SCOPE_SERIALIZED_KEYS.includes(k));
    expect(
      unexpected,
      "a new descriptor field must be reviewed for PII before it can ride an export",
    ).toEqual([]);
  });
});
