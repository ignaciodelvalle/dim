import type {
  CredentialSection,
  OwnerPetBannersSection,
  OwnerPetCasesSection,
  OwnerPetComplianceSection,
} from "@dim/contract/api";
import { describe, expect, it } from "@jest/globals";

import {
  EMPTY_SCHEDULE_REMINDER_DRAFT,
  SECTION_UNAVAILABLE_MESSAGE,
  alertHeadline,
  alertTone,
  buildCancelReminder,
  buildScheduleReminder,
  caretakerBannerLines,
  caseKindLabel,
  caseLine,
  caseStatusLabel,
  casesLine,
  complianceStampLabel,
  complianceSummaryLabel,
  findHomeWebUrl,
  petTagWebUrl,
  rehomeBannerLine,
  reminderCancelledMessage,
  reminderDueLabel,
  remindersOffer,
  remindersOfferLabel,
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
    items: [],
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

describe("caseLine — the CAS- code the reporter has to quote", () => {
  it("prints code, kind and status, in the web badge's order", () => {
    expect(
      caseLine({ casePublicCode: "CAS-1234-5678", kind: "bite_incident", status: "open" }),
    ).toBe("CAS-1234-5678 · Mordedura / observación rábica · Abierto");
  });

  it("says Escalado when an authority moved the case up", () => {
    expect(
      caseLine({ casePublicCode: "CAS-1111-2222", kind: "custody_dispute", status: "escalated" }),
    ).toBe("CAS-1111-2222 · Disputa de custodia · Escalado");
  });

  it("labels every kind the contract can send, and never a raw key", () => {
    // Pinned against LITERALS, not against the function that produced them:
    // these are the web's own `caseKindLabel` strings, so one expediente reads
    // the same way in a browser and on a phone.
    expect(caseKindLabel("adoption_listing")).toBe("Publicación en adopción");
    expect(caseKindLabel("rehome_request")).toBe("Solicitud de nuevo hogar");
    expect(caseKindLabel("microchip_remediation")).toBe("Remediación de microchip");
    expect(caseKindLabel("other")).toBe("Otro trámite");
  });

  it("has a word for both open states", () => {
    expect(caseStatusLabel("open")).toBe("Abierto");
    expect(caseStatusLabel("escalated")).toBe("Escalado");
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

describe("remindersOffer — three states, and unknown is not none", () => {
  const reminder = {
    reminderId: "rem-1",
    title: "Antirrábica anual",
    dueAt: "2026-10-01T12:00:00.000Z",
    daysUntilDue: 28,
    variant: "vacuna",
    isReportable: true,
  };

  it("names each state from the section view", () => {
    expect(
      remindersOffer({ state: "ok", data: { items: [reminder], total: 1, truncated: false } }),
    ).toBe("some");
    expect(remindersOffer({ state: "ok", data: { items: [], total: 0, truncated: false } })).toBe(
      "none",
    );
    expect(remindersOffer({ state: "unavailable", message: SECTION_UNAVAILABLE_MESSAGE })).toBe(
      "unknown",
    );
  });

  it("offers the write in ALL three, and names the second operation only where rows exist", () => {
    // A door that closed because a read failed would be a dead end the person
    // cannot see. `unknown` gets the same label as `none`: nothing to delete
    // that the app can show, but scheduling never needed the list.
    expect(remindersOfferLabel("some")).toBe("Programar o eliminar");
    expect(remindersOfferLabel("none")).toBe("Programar vacuna");
    expect(remindersOfferLabel("unknown")).toBe("Programar vacuna");
  });
});

describe("buildScheduleReminder — the contract's schema, the web's words", () => {
  it("converts the typed DD/MM/AAAA to the wire's YYYY-MM-DD and blank notes to null", () => {
    const built = buildScheduleReminder({
      vaccineName: "  Sextuple ",
      dueAt: "20/11/2026",
      description: "   ",
    });
    expect(built).toEqual({
      ok: true,
      input: {
        command: "create_vaccine_reminder",
        vaccineName: "Sextuple",
        dueAt: "2026-11-20",
        description: null,
      },
    });
  });

  it("refuses a blank name with the sentence the web's own form shows", () => {
    const built = buildScheduleReminder({ ...EMPTY_SCHEDULE_REMINDER_DRAFT, dueAt: "20/11/2026" });
    expect(built).toEqual({
      ok: false,
      code: "VACCINE_NAME_REQUIRED",
      message: "Falta el nombre de la vacuna.",
    });
  });

  it("refuses a half-typed date as MALFORMED and a day that does not exist as INVALID", () => {
    const half = buildScheduleReminder({
      ...EMPTY_SCHEDULE_REMINDER_DRAFT,
      vaccineName: "X",
      dueAt: "20/1",
    });
    expect(half.ok).toBe(false);
    if (!half.ok) expect(half.code).toBe("DUE_AT_MALFORMED");

    // 31/02 rolls over to 3 March under `new Date`; the contract's
    // `isRealArDay` is the backstop, and the sentence must not be the
    // "escribí la fecha como" one — the shape was right, the day was not.
    const rolled = buildScheduleReminder({
      ...EMPTY_SCHEDULE_REMINDER_DRAFT,
      vaccineName: "X",
      dueAt: "31/02/2026",
    });
    expect(rolled.ok).toBe(false);
    if (!rolled.ok) expect(rolled.code).toBe("DUE_AT_INVALID");
  });

  it("cancels by the row id, in the contract's shape", () => {
    expect(buildCancelReminder("rem-1")).toEqual({
      command: "cancel_vaccine_reminder",
      reminderId: "rem-1",
    });
  });
});

describe("reminderCancelledMessage — a replayed cancel is a success", () => {
  it("words both arms of `changed` as done, never as a refusal", () => {
    expect(
      reminderCancelledMessage({
        command: "cancel_vaccine_reminder",
        reminderId: "r",
        changed: true,
      }),
    ).toBe("Listo. El recordatorio quedó eliminado.");
    expect(
      reminderCancelledMessage({
        command: "cancel_vaccine_reminder",
        reminderId: "r",
        changed: false,
      }),
    ).toBe("Ese recordatorio ya estaba eliminado.");
  });
});

// The two web handoffs behind the "Disponible en la web" rows of the ⋯ Más
// sheet (2026-09-11). Until that day both rows rendered with no `onPress`: the
// caption named a destination and the tap went nowhere.
//
// A FIXED ORIGIN, NOT `API_BASE_URL`. The origin these run with in production is
// build configuration and varies per build; passing a literal is what lets the
// whole expected string be written out by hand instead of composed from the
// same pieces the function composes it from.
describe("petTagWebUrl / findHomeWebUrl — the pages the Más sheet hands off to", () => {
  const ORIGIN = "https://example.test";

  it("builds the chapita page for this pet", () => {
    expect(petTagWebUrl(ORIGIN, "DIM-PAMP-0001")).toBe(
      "https://example.test/mis-mascotas/DIM-PAMP-0001/chapita",
    );
  });

  it("builds the buscar-hogar page for this pet", () => {
    expect(findHomeWebUrl(ORIGIN, "DIM-PAMP-0001")).toBe(
      "https://example.test/mis-mascotas/DIM-PAMP-0001/buscar-hogar",
    );
  });

  it("names TWO DIFFERENT pages", () => {
    // The one assertion that survives a copy-paste between the two builders.
    // Both take the same two arguments and differ in a single trailing word, so
    // a body pasted from its neighbour would leave both tests above passing on
    // whichever literal was edited second.
    expect(petTagWebUrl(ORIGIN, "DIM-PAMP-0001")).not.toBe(findHomeWebUrl(ORIGIN, "DIM-PAMP-0001"));
  });

  it("does not double the slash when the origin carries a trailing one", () => {
    // `EXPO_PUBLIC_API_BASE_URL` is read from the environment, and an origin
    // typed with a trailing slash is the ordinary way that happens.
    expect(petTagWebUrl("https://example.test/", "DIM-PAMP-0001")).toBe(
      "https://example.test/mis-mascotas/DIM-PAMP-0001/chapita",
    );
  });

  it("percent-encodes a token that would otherwise change the path", () => {
    // The token is a server-issued `DIM-XXXX-XXXX`, so this is a guard and not
    // a live case — but a raw interpolation is how a path becomes a different
    // path, and the encoding is cheap.
    expect(findHomeWebUrl(ORIGIN, "a/b")).toBe(
      "https://example.test/mis-mascotas/a%2Fb/buscar-hogar",
    );
  });
});
