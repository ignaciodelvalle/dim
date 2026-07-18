import { afterEach, describe, expect, it, vi } from "vitest";

import {
  eventTypeLabel,
  formatCount,
  formatDateShort,
  formatDateTime,
  formatDateTimeLegal,
  formatDelta,
  formatPercent,
  formatRate,
  isoToArDateDisplay,
  maskArDateInput,
  notificationTypeLabel,
  nowLocalDatetimeInAr,
  parseArDateToIso,
  parseArDatetimeLocal,
  parseDateInput,
  rabiesObservationOutcomeLabel,
  relativeDaysShort,
  todayIsoInAr,
} from "./format";

// Regression coverage for the outreach "hace 20624d" bug: never-vaccinated pets
// carry an epoch-sentinel date (new Date(0)), and a 56-year "days ago" value is
// nonsense. relativeDaysShort must keep real overdue counts legible while
// refusing to print an absurd relative figure. (Exec E2E gate.)
describe("relativeDaysShort", () => {
  afterEach(() => vi.useRealTimers());

  const fixedNow = new Date("2026-06-20T12:00:00.000Z");

  function daysAgo(n: number): Date {
    return new Date(fixedNow.getTime() - n * 86_400_000);
  }

  it("returns the empty marker for null/undefined", () => {
    expect(relativeDaysShort(null)).toBe("—");
    expect(relativeDaysShort(undefined)).toBe("—");
  });

  it("treats the epoch sentinel (new Date(0)) as 'no record', not 56 years", () => {
    expect(relativeDaysShort(new Date(0))).toBe("—");
  });

  it("returns the empty marker for an unparseable date", () => {
    expect(relativeDaysShort("not-a-date")).toBe("—");
  });

  it("returns 'hoy' for the current instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    expect(relativeDaysShort(fixedNow)).toBe("hoy");
  });

  it("keeps a legible day count for real overdue values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    expect(relativeDaysShort(daysAgo(400))).toBe("hace 400d");
    expect(relativeDaysShort(daysAgo(900))).toBe("hace 900d");
  });

  it("stays relative right up to the ~10-year threshold, then switches to absolute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    expect(relativeDaysShort(daysAgo(3650))).toBe("hace 3650d");
    expect(relativeDaysShort(daysAgo(3651))).not.toMatch(/hace \d+d/);
  });

  it("never prints an absurd 'hace 20624d' — falls back to an absolute date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    const out = relativeDaysShort(daysAgo(20624));
    expect(out).not.toMatch(/hace \d+d/);
    expect(out).not.toContain("20624");
  });
});

// ---------------------------------------------------------------------------
// Numeric KPI / metric formatters (es-AR) — KPI precision audit 2026-07-07
// ---------------------------------------------------------------------------
//
// Pins the es-AR locale contract: COMMA decimal separator, DOT thousands
// separator. A regression here means dashboards render "41.3%" (wrong locale)
// or drop the decimal a fetcher worked to preserve.

describe("formatCount", () => {
  it("uses the es-AR thousands separator (dot)", () => {
    expect(formatCount(1982)).toBe("1.982");
    expect(formatCount(12345)).toBe("12.345");
    expect(formatCount(0)).toBe("0");
  });

  it("never fabricates a decimal — rounds to an integer", () => {
    expect(formatCount(41.9)).toBe("42");
    expect(formatCount(41.4)).toBe("41");
  });

  it("returns the empty marker for null/undefined/non-finite", () => {
    expect(formatCount(null)).toBe("—");
    expect(formatCount(undefined)).toBe("—");
    expect(formatCount(Number.NaN)).toBe("—");
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("shows one decimal with an es-AR comma", () => {
    expect(formatPercent(41.3)).toBe("41,3%");
    expect(formatPercent(72)).toBe("72,0%");
    expect(formatPercent(66.666)).toBe("66,7%"); // rounds to 1 decimal
    expect(formatPercent(0.4)).toBe("0,4%"); // a tiny non-zero survives
  });

  it("renders exactly 0 and 100 clean (no trailing decimal)", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(100)).toBe("100%");
  });

  it("honours a custom decimals option", () => {
    expect(formatPercent(41.34, { decimals: 2 })).toBe("41,34%");
  });

  it("returns the empty marker for null/undefined/non-finite", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("eventTypeLabel", () => {
  // Regression: the shared libreta (/libreta/compartir) rendered raw snake_case
  // English event types (rabies_observation_ended, incident_reported) to
  // funcionarios/vets. Every event type must resolve to es-AR prose.
  it("maps bite + rabies-observation event types to es-AR prose", () => {
    expect(eventTypeLabel("incident_reported")).toBe("Incidente reportado");
    expect(eventTypeLabel("rabies_observation_started")).toBe("Observación antirrábica iniciada");
    expect(eventTypeLabel("rabies_observation_ended")).toBe("Observación antirrábica finalizada");
  });

  it("never returns raw snake_case for a libreta event type", () => {
    for (const t of [
      "incident_reported",
      "rabies_observation_started",
      "rabies_observation_ended",
    ] as const) {
      expect(eventTypeLabel(t)).not.toMatch(/_/);
    }
  });
});

describe("notificationTypeLabel", () => {
  it("maps the onboarding welcome type to es-AR prose (not the raw code)", () => {
    expect(notificationTypeLabel("welcome")).toBe("Bienvenida");
  });

  it("falls back to the raw code for unknown types", () => {
    expect(notificationTypeLabel("some_unknown_type")).toBe("some_unknown_type");
    expect(notificationTypeLabel(null)).toBe("—");
  });
});

describe("rabiesObservationOutcomeLabel", () => {
  it("maps close outcomes to es-AR prose so bodies never show 'outcome: negative'", () => {
    expect(rabiesObservationOutcomeLabel("negative")).toBe("resultado negativo (animal sano)");
    expect(rabiesObservationOutcomeLabel("positive_rabies")).toBe(
      "resultado positivo (rabia confirmada o sospechada)",
    );
    expect(rabiesObservationOutcomeLabel("dead")).toBe("fallecimiento durante la observación");
    expect(rabiesObservationOutcomeLabel("lost_to_followup")).toBe(
      "sin seguimiento (animal perdido o sin contacto)",
    );
  });

  it("handles null/unknown safely", () => {
    expect(rabiesObservationOutcomeLabel(null)).toBe("resultado no especificado");
    expect(rabiesObservationOutcomeLabel("mystery")).toBe("mystery");
  });
});

describe("formatRate", () => {
  it("shows one decimal with an es-AR comma and no unit", () => {
    expect(formatRate(3.5)).toBe("3,5");
    expect(formatRate(3)).toBe("3,0");
    expect(formatRate(12.34)).toBe("12,3");
  });

  it("uses the es-AR thousands separator for large rates", () => {
    expect(formatRate(1234.5)).toBe("1.234,5");
  });

  it("returns the empty marker for null/undefined/non-finite", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(Number.NaN)).toBe("—");
  });
});

describe("formatDelta", () => {
  it("prefixes an explicit sign and uses an es-AR comma", () => {
    expect(formatDelta(2.4)).toBe("+2,4");
    expect(formatDelta(-1)).toBe("-1,0");
    expect(formatDelta(0)).toBe("0,0"); // zero carries no sign
  });

  it("appends a unit suffix when given", () => {
    expect(formatDelta(2.4, { unit: "pp" })).toBe("+2,4pp");
    expect(formatDelta(-3, { unit: "%", decimals: 0 })).toBe("-3%");
  });

  it("returns the empty marker for null/undefined/non-finite", () => {
    expect(formatDelta(null)).toBe("—");
    expect(formatDelta(Number.NaN)).toBe("—");
  });
});

// Legal-document timestamps (MPF/PPP/travel PDF exports — staging validation
// 2026-07-04, bug 4): the exported PDF printed the server's UTC clock
// ("generado 06:27:41" for a ~17:47 ART generation) with no timezone label.
describe("formatDateTimeLegal", () => {
  it("pins to Argentina time regardless of the ambient/server zone", () => {
    // 2026-07-04T20:47:41Z is 17:47:41 in America/Argentina/Buenos_Aires (UTC-3).
    const out = formatDateTimeLegal(new Date("2026-07-04T20:47:41Z"));
    expect(out).toContain("17:47:41");
    expect(out).not.toContain("20:47:41");
  });

  it("carries an explicit '(hora de Argentina)' label and seconds precision", () => {
    const out = formatDateTimeLegal("2026-07-04T20:47:41Z");
    expect(out).toMatch(/\(hora de Argentina\)$/);
    expect(out).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(out).toContain("04/07/2026");
  });

  it("returns the empty marker for null/invalid input", () => {
    expect(formatDateTimeLegal(null)).toBe("—");
    expect(formatDateTimeLegal("not-a-date")).toBe("—");
  });
});

describe("formatDateShort", () => {
  it("renders the compact abbreviated-month shape (es-AR: '7 de jul de 2026')", () => {
    const out = formatDateShort(new Date("2026-07-07T15:00:00Z"));
    expect(out).toMatch(/7 de jul\.? de 2026/);
  });

  it("pins to Argentina — a late-night AR timestamp keeps the AR calendar day", () => {
    // 2026-07-04T02:30:00Z is 2026-07-03 23:30 in ART (UTC-3): the AR day is the
    // 3rd, not the 4th. A bare (unpinned) formatter on a UTC server would show
    // the 4th — the off-by-one this helper exists to prevent.
    const out = formatDateShort(new Date("2026-07-04T02:30:00Z"));
    expect(out).toContain("3 de jul");
    expect(out).not.toContain("4 de jul");
  });

  it("returns the empty marker for null/invalid input", () => {
    expect(formatDateShort(null)).toBe("—");
    expect(formatDateShort(undefined)).toBe("—");
    expect(formatDateShort("not-a-date")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("pins to Argentina time (UTC-3) — never the ambient zone", () => {
    // 2026-07-04T10:59:41Z → 07:59 ART. The postulación page previously
    // rendered the raw UTC clock via a bare toLocaleString.
    const out = formatDateTime(new Date("2026-07-04T10:59:41Z"));
    expect(out).toContain("07:59");
    expect(out).toContain("4 de julio de 2026");
  });

  // Regression guard for QA histórico 2026-07-08 item 1: the admin audit log
  // (app/admin/auditoria/page.tsx) formatted `entry.performedAt` with a raw
  // `toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })` and
  // no timeZone, so a 05:51 ART action rendered as "8:51" (the UTC clock).
  // The row timestamp now delegates to formatDateTime — this pins the fix.
  it("keeps the admin audit log timestamp pinned to ART (05:51 action, not 08:51 UTC)", () => {
    const out = formatDateTime(new Date("2026-07-08T08:51:00.000Z"));
    expect(out).toContain("05:51");
    expect(out).not.toContain("08:51");
  });

  // Regression guard for QA histórico 2026-07-08 item 1: the transfer
  // detail/list pages (app/(app)/transferencias/**) formatted `expiresAt`
  // with a raw toLocaleString/toLocaleDateString and no timeZone, so a
  // transfer expiring at 03:13 ART rendered "Vence 15/7 06:13 a.m." (the
  // UTC clock). Both surfaces now delegate to formatDate/formatDateTime.
  it("keeps the transfer-expiry timestamp pinned to ART (03:13 expiry, not 06:13 UTC)", () => {
    const out = formatDateTime(new Date("2026-07-15T06:13:00.000Z"));
    expect(out).toContain("03:13");
    expect(out).not.toContain("06:13");
  });
});

// Regression guard for the night-time future-date block (cursor QA 2026-07-15
// A2): form date DEFAULTS computed as `new Date().toISOString().slice(0, 10)`
// resolve in UTC, so late in the AR evening (UTC-3) "today" becomes TOMORROW and
// the "no future date" rule rejects the untouched default. todayIsoInAr must
// return the Argentine calendar day for that instant.
describe("todayIsoInAr", () => {
  it("returns the AR calendar day when UTC has already rolled to the next day", () => {
    // 2026-07-16T01:30:00Z is the 16th in UTC but still 22:30 on the 15th in AR.
    const arToday = todayIsoInAr(new Date("2026-07-16T01:30:00.000Z"));
    expect(arToday).toBe("2026-07-15");
    // The UTC computation the app previously used would wrongly say "tomorrow".
    expect(new Date("2026-07-16T01:30:00.000Z").toISOString().slice(0, 10)).toBe("2026-07-16");
  });

  it("returns YYYY-MM-DD and agrees with UTC when both zones are on the same day", () => {
    const arToday = todayIsoInAr(new Date("2026-07-15T15:00:00.000Z"));
    expect(arToday).toBe("2026-07-15");
    expect(arToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// Regression guard for the same class of bug as todayIsoInAr, but for
// `<input type="datetime-local">` defaults (PetSightingForm "¿Cuándo la
// viste?"): `new Date().toISOString().slice(0, 16)` is UTC wall-clock, 3h
// ahead of Argentina, and rolls to the next AR calendar day near AR midnight.
describe("nowLocalDatetimeInAr", () => {
  it("subtracts the 3h AR offset from a UTC instant", () => {
    // 2026-07-15T18:00:00Z is 15:00 in Argentina (UTC-3).
    expect(nowLocalDatetimeInAr(new Date("2026-07-15T18:00:00.000Z"))).toBe("2026-07-15T15:00");
  });

  it("rolls back to the PREVIOUS calendar day when UTC has already advanced", () => {
    // 2026-07-16T01:30:00Z is the 16th in UTC but still 22:30 on the 15th in AR.
    const arNow = nowLocalDatetimeInAr(new Date("2026-07-16T01:30:00.000Z"));
    expect(arNow).toBe("2026-07-15T22:30");
    // The UTC computation the app previously used would wrongly say "tomorrow".
    expect(new Date("2026-07-16T01:30:00.000Z").toISOString().slice(0, 16)).toBe(
      "2026-07-16T01:30",
    );
  });

  it("returns YYYY-MM-DDTHH:mm, zero-padded, 24h clock", () => {
    const arNow = nowLocalDatetimeInAr(new Date("2026-07-15T03:05:00.000Z"));
    expect(arNow).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // 03:05Z - 3h = 00:05 AR, not "0:05" or "24:05".
    expect(arNow).toBe("2026-07-15T00:05");
  });
});

// Browser-independent dd/mm/aaaa date entry (DateInputAr backing helpers).
// The whole point of this control is that an es-AR operator's "03/07" is always
// 3-July, never mm/dd 7-March, on every browser — so parsing must be strict and
// leap-aware, and the round-trip ISO<->display must be lossless.
describe("parseDateInput", () => {
  it("anchors a YYYY-MM-DD input at NOON UTC of that calendar day", () => {
    // The noon anchor is a deliberate, load-bearing choice: it keeps the date
    // on the same calendar day when rendered in any zone within ±12h, and 21
    // consumers (incl. the legal rabies-observation window) depend on it.
    expect(parseDateInput("2026-07-08")?.toISOString()).toBe("2026-07-08T12:00:00.000Z");
    expect(parseDateInput("2024-02-29")?.toISOString()).toBe("2024-02-29T12:00:00.000Z");
  });

  it("returns null for empty or garbage input", () => {
    expect(parseDateInput(null)).toBeNull();
    expect(parseDateInput(undefined)).toBeNull();
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput("not-a-date")).toBeNull();
    expect(parseDateInput("2026-13-45")).toBeNull();
  });
});

describe("parseArDatetimeLocal", () => {
  it("parses a datetime-local string as AR wall clock (UTC-3)", () => {
    // 18:00 AR = 21:00 UTC — NOT 18:00 UTC (what an offset-less parse yields
    // on a UTC server, firing dose reminders 3h early).
    expect(parseArDatetimeLocal("2026-07-08T18:00")?.toISOString()).toBe(
      "2026-07-08T21:00:00.000Z",
    );
  });

  it("round-trips with nowLocalDatetimeInAr", () => {
    const instant = new Date("2026-07-08T14:37:00.000Z");
    const local = nowLocalDatetimeInAr(instant); // "2026-07-08T11:37"
    expect(parseArDatetimeLocal(local)?.toISOString()).toBe(instant.toISOString());
  });

  it("crosses the UTC midnight boundary at 21:00 ART correctly", () => {
    // 21:00 AR on the 8th is already 00:00Z on the 9th — the UTC calendar day
    // advances but the AR wall clock (and the value the user typed) does not.
    const parsed = parseArDatetimeLocal("2026-07-08T21:00");
    expect(parsed?.toISOString()).toBe("2026-07-09T00:00:00.000Z");
    expect(parsed ? nowLocalDatetimeInAr(parsed) : null).toBe("2026-07-08T21:00");
  });

  it("accepts an optional seconds component", () => {
    expect(parseArDatetimeLocal("2026-07-08T18:00:30")?.toISOString()).toBe(
      "2026-07-08T21:00:30.000Z",
    );
  });

  it("returns null for empty or malformed input", () => {
    expect(parseArDatetimeLocal(null)).toBeNull();
    expect(parseArDatetimeLocal(undefined)).toBeNull();
    expect(parseArDatetimeLocal("")).toBeNull();
    expect(parseArDatetimeLocal("2026-07-08")).toBeNull(); // date-only
    expect(parseArDatetimeLocal("garbage")).toBeNull();
    expect(parseArDatetimeLocal("2026-07-08T18:00Z")).toBeNull(); // explicit zone
    expect(parseArDatetimeLocal("2026-13-08T18:00")).toBeNull(); // impossible month
  });
});

describe("isoToArDateDisplay", () => {
  it("renders ISO yyyy-mm-dd as dd/mm/aaaa", () => {
    expect(isoToArDateDisplay("2026-07-03")).toBe("03/07/2026");
    expect(isoToArDateDisplay("2024-02-29")).toBe("29/02/2024");
  });

  it("returns empty string for empty or non-ISO input", () => {
    expect(isoToArDateDisplay(null)).toBe("");
    expect(isoToArDateDisplay(undefined)).toBe("");
    expect(isoToArDateDisplay("")).toBe("");
    expect(isoToArDateDisplay("03/07/2026")).toBe("");
    expect(isoToArDateDisplay("2026-7-3")).toBe("");
  });
});

describe("parseArDateToIso", () => {
  it("parses a valid dd/mm/aaaa to ISO — 03/07 is 3-July, not 7-March", () => {
    expect(parseArDateToIso("03/07/2026")).toBe("2026-07-03");
    expect(parseArDateToIso("31/12/2025")).toBe("2025-12-31");
    expect(parseArDateToIso(" 01/01/2026 ")).toBe("2026-01-01");
  });

  it("accepts a real leap day but rejects a non-leap 29 Feb", () => {
    expect(parseArDateToIso("29/02/2024")).toBe("2024-02-29");
    expect(parseArDateToIso("29/02/2025")).toBeNull();
  });

  it("rejects impossible dates", () => {
    expect(parseArDateToIso("32/01/2026")).toBeNull();
    expect(parseArDateToIso("00/01/2026")).toBeNull();
    expect(parseArDateToIso("15/13/2026")).toBeNull();
    expect(parseArDateToIso("15/00/2026")).toBeNull();
    expect(parseArDateToIso("31/04/2026")).toBeNull(); // April has 30 days
  });

  it("rejects malformed or empty input", () => {
    expect(parseArDateToIso(null)).toBeNull();
    expect(parseArDateToIso("")).toBeNull();
    expect(parseArDateToIso("3/7/2026")).toBeNull(); // not zero-padded
    expect(parseArDateToIso("2026-07-03")).toBeNull(); // ISO, not display
    expect(parseArDateToIso("abc")).toBeNull();
  });

  it("round-trips ISO -> display -> ISO losslessly", () => {
    for (const iso of ["2026-07-03", "2024-02-29", "2025-12-31", "2026-01-01"]) {
      expect(parseArDateToIso(isoToArDateDisplay(iso))).toBe(iso);
    }
  });
});

describe("maskArDateInput", () => {
  it("inserts slashes progressively as digits are typed", () => {
    expect(maskArDateInput("0")).toBe("0");
    expect(maskArDateInput("03")).toBe("03");
    expect(maskArDateInput("037")).toBe("03/7");
    expect(maskArDateInput("0307")).toBe("03/07");
    expect(maskArDateInput("03072")).toBe("03/07/2");
    expect(maskArDateInput("03072026")).toBe("03/07/2026");
  });

  it("strips non-digits and caps at 8 digits", () => {
    expect(maskArDateInput("03/07/2026")).toBe("03/07/2026");
    expect(maskArDateInput("ab03cd07")).toBe("03/07");
    expect(maskArDateInput("030720261234")).toBe("03/07/2026");
  });
});
