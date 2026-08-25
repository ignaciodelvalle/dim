import type {
  CredentialSection,
  OwnerPetBannersSection,
  OwnerPetCasesSection,
  OwnerPetComplianceSection,
} from "@dim/contract/api";
import { describe, expect, it } from "@jest/globals";

import {
  SECTION_UNAVAILABLE_MESSAGE,
  alertHeadline,
  alertTone,
  caretakerBannerLines,
  casesLine,
  complianceStampLabel,
  complianceSummaryLabel,
  rehomeBannerLine,
  reminderDueLabel,
  sectionView,
  transitBannerLine,
  truncationNote,
  viewerRoleLabel,
} from "./owner-face-view-model";

describe("sectionView — unavailable is not empty", () => {
  it("carries the data through when the server read it", () => {
    const section: CredentialSection<number> = { status: "ok", data: 7 };
    expect(sectionView(section)).toEqual({ state: "ok", data: 7 });
  });

  it("carries COPY, not a bare tag, when the server could not read it", () => {
    // A screen cannot render this as an empty view without noticing it threw a
    // string away — which is the point.
    const section: CredentialSection<number> = { status: "unavailable" };
    expect(sectionView(section)).toEqual({
      state: "unavailable",
      message: SECTION_UNAVAILABLE_MESSAGE,
    });
  });
});

describe("alerts — copy and tone, never order", () => {
  it("names every alert the contract can send", () => {
    const ids = [
      "lost",
      "rabies",
      "transit",
      "caretaker",
      "rehome",
      "open-cases",
      "pregnancy",
    ] as const;
    for (const id of ids) {
      const headline = alertHeadline({ id, tone: "info" });
      expect(headline.length).toBeGreaterThan(0);
      // No arm may fall through to the unknown-id branch.
      expect(headline).not.toContain("sin descripción");
    }
  });

  it("maps urgency onto the kit's callout tones", () => {
    expect(alertTone({ id: "lost", tone: "urgent" })).toBe("err");
    expect(alertTone({ id: "transit", tone: "warning" })).toBe("warn");
    expect(alertTone({ id: "pregnancy", tone: "info" })).toBe("neutral");
  });
});

describe("viewerRoleLabel — a holder must know why things are missing", () => {
  it("distinguishes the titular from every other holder", () => {
    expect(viewerRoleLabel("owner")).toBe("Sos el titular");
    expect(viewerRoleLabel("co_owner")).not.toBe(viewerRoleLabel("owner"));
    expect(viewerRoleLabel("foster")).not.toBe(viewerRoleLabel("caretaker"));
    expect(viewerRoleLabel("org_member")).toContain("organización");
  });
});

describe("complianceStampLabel — SIN DATO is not a temporal word", () => {
  const state = (over: Partial<OwnerPetComplianceSection>): OwnerPetComplianceSection => ({
    cards: [],
    summary: { total: 4, ok: 3, label: "3 de 4 al día" },
    worstTone: "ok",
    worstIsUnknown: false,
    ...over,
  });

  it("never borrows a deadline word for a missing fact", () => {
    // The PPP "Faltan datos" card is deliberately toned `due` so it ranks high.
    // Stamping "POR VENCER" over it would announce a deadline that does not
    // exist — the projection already says which case this is.
    expect(complianceStampLabel(state({ worstTone: "due", worstIsUnknown: true }))).toBe(
      "SIN DATO",
    );
    expect(complianceStampLabel(state({ worstTone: "due", worstIsUnknown: false }))).toBe(
      "POR VENCER",
    );
  });

  it("prints the word for each tone", () => {
    expect(complianceStampLabel(state({ worstTone: "ok" }))).toBe("AL DÍA");
    expect(complianceStampLabel(state({ worstTone: "over" }))).toBe("VENCIDA");
    expect(complianceStampLabel(state({ worstTone: "reserved" }))).toBe("TURNO RESERVADO");
  });

  it("says there are no obligations rather than '0 de 0 al día'", () => {
    expect(
      complianceSummaryLabel(state({ summary: { total: 0, ok: 0, label: "0 de 0 al día" } })),
    ).toBe("Sin obligaciones cargadas para tu jurisdicción");
    expect(complianceSummaryLabel(state({}))).toBe("3 de 4 al día");
  });
});

describe("reminderDueLabel — a date, never a bare number", () => {
  it("reads naturally around today", () => {
    expect(reminderDueLabel(0)).toBe("Vence hoy");
    expect(reminderDueLabel(1)).toBe("Vence mañana");
    expect(reminderDueLabel(5)).toBe("Vence en 5 días");
  });

  it("says an overdue reminder is overdue, in the past tense", () => {
    expect(reminderDueLabel(-1)).toBe("Venció ayer");
    expect(reminderDueLabel(-4)).toBe("Venció hace 4 días");
  });
});

describe("truncationNote — a partial list must SAY it is partial", () => {
  it("is silent when the list is whole", () => {
    expect(truncationNote(8, 8, "mascotas")).toBeNull();
    // Defensive: a shown count above the total is nonsense, but it must not
    // produce "Mostrando 9 de 8".
    expect(truncationNote(9, 8, "mascotas")).toBeNull();
  });

  it("names both numbers when the list was capped", () => {
    expect(truncationNote(8, 14, "mascotas")).toBe("Mostrando 8 de 14 mascotas.");
  });
});

describe("casesLine — a capped count is a floor, and says so", () => {
  const cases = (over: Partial<OwnerPetCasesSection>): OwnerPetCasesSection => ({
    openCount: 0,
    truncated: false,
    ...over,
  });

  it("is an honest zero", () => {
    expect(casesLine(cases({}))).toBe("No tiene trámites abiertos.");
  });

  it("agrees in number", () => {
    expect(casesLine(cases({ openCount: 1 }))).toBe("1 trámite abierto.");
    expect(casesLine(cases({ openCount: 3 }))).toBe("3 trámites abiertos.");
  });

  it("says 'al menos' when the read hit its cap", () => {
    expect(casesLine(cases({ openCount: 50, truncated: true }))).toBe(
      "Al menos 50 trámites abiertos.",
    );
  });
});

describe("banners — the two-key public-contact model", () => {
  const banners = (over: Partial<OwnerPetBannersSection>): OwnerPetBannersSection => ({
    transit: null,
    caretaker: null,
    rehome: null,
    ...over,
  });

  it("has nothing to say when there are no arrangements", () => {
    expect(caretakerBannerLines(banners({}))).toEqual([]);
    expect(rehomeBannerLine(banners({}))).toBeNull();
    expect(transitBannerLine(banners({}))).toBeNull();
  });

  it("names the caretaker when one is active", () => {
    const lines = caretakerBannerLines(
      banners({
        caretaker: { state: "active", caretakerName: "Ana", publicContactName: null },
      }),
    );
    expect(lines[0]).toBe("Ana la está cuidando.");
    // KEY 2 absent → no public-contact line at all. A row offering something
    // the caretaker never consented to would be a lie shaped like a control.
    expect(lines).toHaveLength(1);
  });

  it("adds the public-contact line ONLY when consent was given", () => {
    const lines = caretakerBannerLines(
      banners({
        caretaker: { state: "active", caretakerName: "Ana", publicContactName: "Ana" },
      }),
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("contacto público");
  });

  it("distinguishes a pending arrangement from a lapsed one", () => {
    expect(
      caretakerBannerLines(
        banners({ caretaker: { state: "pending", caretakerName: null, publicContactName: null } }),
      )[0],
    ).toContain("sin responder");
    expect(
      caretakerBannerLines(
        banners({
          caretaker: { state: "recently_ended", caretakerName: null, publicContactName: null },
        }),
      )[0],
    ).toContain("terminó");
  });

  it("falls back to a neutral noun when the org has no display name", () => {
    expect(rehomeBannerLine(banners({ rehome: { kind: "pending", orgDisplayName: null } }))).toBe(
      "Hay una propuesta de adopción pendiente con la organización.",
    );
    expect(
      rehomeBannerLine(banners({ rehome: { kind: "active", orgDisplayName: "Refugio Sur" } })),
    ).toBe("Refugio Sur está buscándole un nuevo hogar.");
  });

  it("tells a transit holder where the actions live", () => {
    // The actions are org-mediated and would dead-end for a vecino who picked
    // up a stray, so the banner shows and the actions do not.
    expect(transitBannerLine(banners({ transit: { canManageFosterActions: false } }))).toContain(
      "web",
    );
  });
});
