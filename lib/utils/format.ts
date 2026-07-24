// Spanish-language formatting helpers for dates, enums, and event labels.
// All UI strings live here so we can change copy without touching components.

import type { EventType } from "@/db/schema";

/**
 * The one timezone every UI date is formatted in. miMAR is an Argentina-only
 * service, so a calendar day is always the Argentine calendar day.
 *
 * WHY THIS MUST BE PINNED (React #418): date formatters run BOTH during SSR
 * (in the server process — UTC on Vercel/CI) and again during client
 * hydration (in the browser — the viewer's zone). Without an explicit
 * `timeZone`, `Intl.DateTimeFormat`/`toLocaleDateString` use the AMBIENT zone,
 * so a date stored near local midnight (e.g. a date-only value at T00:00:00Z)
 * renders as one calendar day on the server and the previous day on the
 * client → the server HTML and client render disagree → hydration mismatch
 * (React error #418), which cascades into blank/frozen paints. Pinning the
 * zone makes SSR and hydration produce byte-identical strings.
 *
 * ANY client-side date formatter MUST pass this as its `timeZone`. Import this
 * constant instead of hardcoding the string so the decision stays in one place.
 */
export const AR_TIME_ZONE = "America/Argentina/Buenos_Aires";

const SPANISH_DATE_FORMAT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: AR_TIME_ZONE,
});

const SPANISH_DATETIME_FORMAT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: AR_TIME_ZONE,
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return SPANISH_DATE_FORMAT.format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return SPANISH_DATETIME_FORMAT.format(date);
}

// Compact date — "7 de jul de 2026". AR-pinned like every formatter here: without an
// explicit timeZone, Intl uses the RUNTIME zone (UTC on the production server),
// so a timestamp near AR midnight renders the wrong calendar day and, worse,
// mismatches between SSR (UTC) and browser hydration (bug #418). This is the
// canonical short form — dozens of call sites previously hand-rolled the same
// { day, month:"short", year } shape, many WITHOUT the timeZone (the off-by-one
// bug this centralises away).
const SPANISH_DATE_SHORT_FORMAT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: AR_TIME_ZONE,
});

export function formatDateShort(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return SPANISH_DATE_SHORT_FORMAT.format(date);
}

// Legal-document timestamp (MPF/PPP PDF exports — staging validation
// 2026-07-04, bug 4): seconds precision + an EXPLICIT timezone label. A legal
// PDF printing a bare clock ("generado 06:27:41" for a 17:47 ART generation,
// server clock = UTC) is ambiguous evidence; every legal timestamp must be
// AR-pinned AND say so.
const SPANISH_DATETIME_LEGAL_FORMAT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  // 24-hour clock — es-AR's Intl default is 12-hour ("05:47:41 p. m."), which
  // reintroduces exactly the am/pm ambiguity this formatter exists to remove.
  hourCycle: "h23",
  timeZone: AR_TIME_ZONE,
});

/**
 * es-AR timestamp for legal/exported documents: "07/07/2026, 17:47:41 (hora
 * de Argentina)". Always pinned to AR_TIME_ZONE with an explicit label —
 * never render a legal clock without its timezone.
 */
export function formatDateTimeLegal(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${SPANISH_DATETIME_LEGAL_FORMAT.format(date)} (hora de Argentina)`;
}

// Parse a "YYYY-MM-DD" string from <input type="date"> into a Date anchored at
// noon UTC of that calendar day. Noon UTC stays on the same calendar date when
// rendered in any timezone within ±12 hours, so the user sees the date they
// picked instead of the previous day. Returns null if the string is empty or
// invalid.
export function parseDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// "YYYY-MM-DDTHH:mm" (optional ":ss") from <input type="datetime-local">.
const AR_DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

/**
 * Parse a "YYYY-MM-DDTHH:mm" string from `<input type="datetime-local">` as
 * ARGENTINE wall-clock time. Returns null for empty/malformed input.
 *
 * WHY (not `new Date(value)`): an offset-less date-time string is parsed in
 * the RUNTIME's local zone — UTC on the server — so "2026-07-08T18:00" typed
 * by an es-AR user becomes 18:00Z = 15:00 AR, three hours early. Our
 * datetime-local defaults are AR wall clock (`nowLocalDatetimeInAr`), so the
 * submitted string must be read back in the same zone. Argentina is UTC-3
 * year-round (no DST since 2009), so a fixed "-03:00" suffix is exact and
 * needs no zone database.
 */
export function parseArDatetimeLocal(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!AR_DATETIME_LOCAL_RE.test(trimmed)) return null;
  const d = new Date(`${trimmed}-03:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// "YYYY-MM-DD" of the CURRENT calendar day in Argentina. en-CA emits the
// ISO-ordered YYYY-MM-DD form; pinning AR_TIME_ZONE makes it the Argentine day.
const AR_ISO_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: AR_TIME_ZONE,
});

/**
 * Today's calendar day in Argentina as "YYYY-MM-DD" — the correct DEFAULT for a
 * `<input type="date">`.
 *
 * WHY (not `new Date().toISOString().slice(0, 10)`): `toISOString()` yields the
 * UTC calendar day. On the server (UTC) or late in the AR evening (UTC-3), that
 * is TOMORROW relative to Argentina — so a "today" default silently becomes a
 * FUTURE date and any form with a "no future date" rule rejects it ("la fecha no
 * puede ser futura"). Formatting through AR_TIME_ZONE returns the real Argentine
 * calendar day, so the default is never spuriously future.
 *
 * `now` is injectable so tests can pin a UTC-tomorrow / AR-today instant.
 */
export function todayIsoInAr(now: Date = new Date()): string {
  return isoDateInAr(now);
}

/**
 * The Argentine calendar day ("YYYY-MM-DD") of an arbitrary instant. Same
 * AR_TIME_ZONE pinning as `todayIsoInAr` (which delegates here) — use it to
 * bucket historical timestamps by their Argentine day (e.g. grouping an activity
 * feed), where "today" semantics would be wrong.
 */
export function isoDateInAr(date: Date): string {
  return AR_ISO_DATE_FORMAT.format(date);
}

// "YYYY-MM-DDTHH:mm" of the CURRENT wall-clock instant in Argentina — the
// correct DEFAULT for a `<input type="datetime-local">`. hourCycle "h23"
// keeps a 24-hour, zero-padded hour (midnight = "00", never "24") matching
// the datetime-local input format exactly.
const AR_ISO_DATETIME_PARTS_FORMAT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: AR_TIME_ZONE,
});

/**
 * Argentina's current wall-clock instant as "YYYY-MM-DDTHH:mm" — the correct
 * DEFAULT for a `<input type="datetime-local">`.
 *
 * WHY (not `new Date().toISOString().slice(0, 16)`): `toISOString()` yields
 * UTC wall-clock, 3 hours ahead of Argentina. A "right now" default computed
 * that way is off by 3 hours always, and off by a full CALENDAR DAY near
 * midnight (e.g. 00:30 AR is still 03:30Z the same UTC day, but 22:30 AR is
 * already 01:30Z the NEXT UTC day). Building the string from
 * `Intl.DateTimeFormat` parts (rather than string-slicing a formatted
 * output) sidesteps locale punctuation entirely.
 *
 * `now` is injectable so tests can pin a UTC instant and assert the AR
 * wall-clock result, including the 3h offset.
 */
export function nowLocalDatetimeInAr(now: Date = new Date()): string {
  const parts = AR_ISO_DATETIME_PARTS_FORMAT.formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/**
 * Compact numeric AR-pinned date+time — "17/07/2026 04:30" (dd/mm/aaaa HH:mm,
 * 24-hour). Built from `Intl.DateTimeFormat` PARTS (not a formatted string) so
 * the separators are fixed regardless of the es-AR locale's punctuation (which
 * inserts a comma between date and time). AR_TIME_ZONE-pinned like every
 * formatter here — a timestamp near AR midnight never renders the wrong calendar
 * day, and SSR (UTC) and browser hydration produce byte-identical strings.
 * Returns "—" for empty/invalid input.
 */
export function formatDateTimeNumericAr(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = AR_ISO_DATETIME_PARTS_FORMAT.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}/${part("year")} ${part("hour")}:${part("minute")}`;
}

// Compact "DD/MM" AR-pinned date that appends the year ONLY when it differs
// from the CURRENT Argentine calendar year — "18/07" this year, "18/07/2027"
// any other (medianos-sesión-2, finding #1). A bare "Próxima 18/7" is fine
// 364 days out of 365, but silently WRONG the one day a due date crosses into
// next year — it reads as "today" when the real date is a year out. Compares
// AR-calendar years via `isoDateInAr` (never a raw UTC year: `Date#getFullYear`
// runs in the machine's local zone, which flips the day near AR midnight on
// both SSR and hydration — the same #418 class every formatter here guards
// against). `now` is injectable so tests can pin the comparison year.
export function formatDateArOmitCurrentYear(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = AR_ISO_DATETIME_PARTS_FORMAT.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const base = `${part("day")}/${part("month")}`;
  const dateYear = isoDateInAr(date).slice(0, 4);
  const nowYear = isoDateInAr(now).slice(0, 4);
  return dateYear === nowYear ? base : `${base}/${dateYear}`;
}

// ---------------------------------------------------------------------------
// Browser-independent dd/mm/aaaa date entry (operator filter surfaces)
// ---------------------------------------------------------------------------
//
// Native `<input type="date">` renders its VISIBLE text per the browser's OS
// locale, not per any attribute we control. `lang="es-AR"` only nudges
// Chromium; Safari/Firefox ignore it and show mm/dd/yyyy on an en-US machine.
// An es-AR operator then reads "03/07" as 7-March while the browser meant
// 3-July → the submitted range is silently wrong. These helpers back a
// hand-rolled dd/mm/aaaa text input (DateInputAr) that displays identically on
// EVERY browser and still emits an ISO `yyyy-mm-dd` value for the query.
//
// All three are pure (no DOM) and unit-tested.

const AR_DATE_DISPLAY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * ISO `yyyy-mm-dd` → es-AR display `dd/mm/aaaa`. Returns "" for empty or
 * non-ISO input (so a blank/garbage default renders as an empty field, never
 * a broken string).
 */
export function isoToArDateDisplay(value: string | null | undefined): string {
  if (!value) return "";
  const m = value.match(ISO_DATE_RE);
  if (!m) return "";
  const [, yyyy, mm, dd] = m;
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * es-AR display `dd/mm/aaaa` → ISO `yyyy-mm-dd`, or `null` when the string is
 * empty, malformed, or an impossible calendar date (32/13/2026, 31/02/2026,
 * 29/02/2025). Validates the day against the real length of the given month so
 * a wrong range can be CLEARED instead of submitted.
 */
export function parseArDateToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.trim().match(AR_DATE_DISPLAY_RE);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12) return null;
  if (year < 1) return null;
  // day 0 of the NEXT month (1-based `month` as the 0-based index of the month
  // after) is the last day of the target month — the real length, leap-aware.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Progressive input mask for dd/mm/aaaa: keeps only digits (max 8) and inserts
 * the slashes as the operator types, so the field always reads dd, dd/mm, or
 * dd/mm/aaaa. Pure string transform — no validation (that is `parseArDateToIso`).
 */
export function maskArDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function speciesLabel(species: string): string {
  switch (species) {
    case "dog":
      return "Perro";
    case "cat":
      return "Gato";
    case "rabbit":
      return "Conejo";
    case "guinea_pig":
      return "Cobayo";
    case "ferret":
      return "Hurón";
    case "other":
      return "Otra";
    default:
      return species;
  }
}

export function sexLabel(sex: string): string {
  switch (sex) {
    case "male":
      return "Macho";
    case "female":
      return "Hembra";
    case "unknown":
      return "No especificado";
    default:
      return sex;
  }
}

/**
 * "Castrada" / "Castrado" agreeing with the pet's sex.
 *
 * Three surfaces inlined this ternary and a fourth — the public credential —
 * shipped "Castrado/a" instead, which is how a QA tester read it about Pampa, a
 * female (ronda 5, 2026-07-16). A slashed both-genders label is the tell that a
 * screen has the fact and is not using it: sex is always on the pet row.
 *
 * "unknown" keeps the slashed form — there it is honest rather than lazy.
 */
export function sterilizedLabel(sex: string): string {
  switch (sex) {
    case "male":
      return "Castrado";
    case "female":
      return "Castrada";
    default:
      return "Castrado/a";
  }
}

/**
 * "Perdida" / "Perdido" agreeing with the pet's sex.
 *
 * Same shape and same reason as sterilizedLabel: the lost listing inlined
 * `sex === "female" ? "Perdida" : "Perdido"`, which calls an unknown-sex pet
 * male. 22k+ pets carry `sex = 'unknown'` — a stray posted by a finder rarely
 * has a known sex, which is exactly the population this listing is for.
 */
export function lostLabel(sex: string): string {
  switch (sex) {
    case "male":
      return "Perdido";
    case "female":
      return "Perdida";
    default:
      return "Perdido/a";
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Activa";
    case "lost":
      return "Perdida";
    case "deceased":
      return "Fallecida";
    default:
      return status;
  }
}

/** es-AR label for a profile account type (`personal` | `institutional`). */
export function accountTypeLabel(accountType: string): string {
  switch (accountType) {
    case "personal":
      return "Personal";
    case "institutional":
      return "Institucional";
    default:
      return accountType;
  }
}

/** es-AR label for an operator role (`owner` | `vet` | `govt` | `admin`). */
export function roleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "Dueño/a";
    case "vet":
      return "Veterinario/a";
    case "govt":
      return "Gobierno";
    case "admin":
      return "Administrador/a";
    default:
      return role;
  }
}

// ---------------------------------------------------------------------------
// Sex-aware lost-mode copy (UI-4)
// ---------------------------------------------------------------------------
//
// The public credential and cockpit must gender the "lost" wording by the
// pet's recorded sex instead of guessing from the name ending. Three cases:
//   - male    → masculine ("perdido")
//   - female  → feminine  ("perdida")
//   - unknown → a sex-neutral phrasing that reads naturally in es-AR and never
//               assumes a gender ("Se perdió" / "Me perdí").
//
// Pure functions — no DOM, exported for unit testing.

export type PetSex = "male" | "female" | "unknown";

function normalizeSex(sex: string | null | undefined): PetSex {
  return sex === "male" || sex === "female" ? sex : "unknown";
}

/** Banner headline, e.g. "ESTÁ PERDIDO" / "ESTÁ PERDIDA" / "SE PERDIÓ". */
export function lostBannerHeadline(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "ESTÁ PERDIDO";
    case "female":
      return "ESTÁ PERDIDA";
    default:
      return "SE PERDIÓ";
  }
}

/** First-person hero line spoken by the pet, e.g. "Estoy perdido" / "Me perdí". */
export function lostFirstPersonLine(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "Estoy perdido";
    case "female":
      return "Estoy perdida";
    default:
      return "Me perdí";
  }
}

/** Third-person "está perdid{o|a}" / "se perdió" used in cockpit/share copy. */
export function lostThirdPersonPhrase(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "está perdido";
    case "female":
      return "está perdida";
    default:
      return "se perdió";
  }
}

/** Mark-found button / past-participle wording, e.g. "encontrado" / "encontrada". */
export function foundParticiple(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "encontrado";
    case "female":
      return "encontrada";
    default:
      // Neutral: "encontrada/o" reads as the inclusive form when sex is unknown.
      return "encontrada/o";
  }
}

/** Finder-claims-custody CTA, e.g. "La tengo conmigo" / "Lo tengo conmigo". */
export function foundPossessivePhrase(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "Lo tengo conmigo";
    case "female":
      return "La tengo conmigo";
    default:
      // Neutral: sidesteps the lo/la pronoun when sex is unknown.
      return "Está conmigo";
  }
}

/** Sighting CTA/headline, e.g. "La vi cerca de acá" / "Lo vi cerca de acá". Used
 * both as the sighting-form page headline and the lower-commitment CTA button
 * next to foundPossessivePhrase on the lost public credential — the two must
 * agree with the pet's recorded sex, not default to feminine. */
export function sightingPhrase(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "Lo vi cerca de acá";
    case "female":
      return "La vi cerca de acá";
    default:
      // Neutral: sidesteps the lo/la pronoun when sex is unknown.
      return "Vi a la mascota cerca de acá";
  }
}

/** Found-report prompt on a NOT-lost public credential (sticky action bar,
 * cursor citizen review P3) — the finder path stays useful for a
 * found-but-not-marked-lost pet. Voseo imperative with enclitic pronoun. */
export function foundReportPrompt(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "¿Lo encontraste? Reportalo";
    case "female":
      return "¿La encontraste? Reportala";
    default:
      // Neutral: sidesteps the lo/la pronoun when sex is unknown.
      return "¿Encontraste a esta mascota? Reportá";
  }
}

/**
 * Owner-side action label / sheet title: "Marcar como perdido" / "Marcar como
 * perdida" / "Marcar como perdido/a". Ciclo-perdido sweep (tester ronda
 * 2026-07-16): the mark-lost sheet title, the perdida page heading, and the
 * cartel guard CTA all hardcoded the feminine form. The "/a" neutral matches
 * the roleLabel "Dueño/a" convention.
 */
export function markLostActionLabel(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "Marcar como perdido";
    case "female":
      return "Marcar como perdida";
    default:
      return "Marcar como perdido/a";
  }
}

/** Sighting-form question, e.g. "¿Cuándo lo viste?" / "¿Cuándo la viste?".
 * Neutral sidesteps the lo/la pronoun when sex is unknown. */
export function sightedWhenQuestion(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "¿Cuándo lo viste?";
    case "female":
      return "¿Cuándo la viste?";
    default:
      return "¿Cuándo viste a la mascota?";
  }
}

/** "si lo viste" / "si la viste" / "si viste a la mascota" — share-message
 * fragment; must agree with the pet, never default to feminine. */
export function lostSeenCallout(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "si lo viste";
    case "female":
      return "si la viste";
    default:
      return "si viste a la mascota";
  }
}

/**
 * Generic lost-mode share message (WhatsApp / native share) for surfaces with
 * NO disclosure data (MergedShareSheet): names only the pet, flexed by sex.
 * e.g. "Rocco está perdido. Mirá su credencial y avisanos si lo viste:"
 */
export function lostShareMessage(petName: string, sex: string | null | undefined): string {
  return `${petName} ${lostThirdPersonPhrase(sex)}. Mirá su credencial y avisanos ${lostSeenCallout(sex)}:`;
}

/**
 * Bandeja / workflow-item title for an active lost episode, e.g.
 * "Rocco está reportado como perdido" / "Michi está reportada como perdida".
 * Neutral rewords to avoid the participle: "Se reportó la pérdida de X".
 */
export function lostReportedTitle(petName: string, sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return `${petName} está reportado como perdido`;
    case "female":
      return `${petName} está reportada como perdida`;
    default:
      return `Se reportó la pérdida de ${petName}`;
  }
}

/**
 * Cartel/A4 poster headline. Sex-correct where known; the neutral form is the
 * classic street-poster "SE BUSCA" (tester fix #3a) rather than a slashed
 * "PERDIDO/A" — a poster headline must read at a glance.
 */
export function lostPosterHeadline(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "PERDIDO";
    case "female":
      return "PERDIDA";
    default:
      return "SE BUSCA";
  }
}

/** "Última vez visto" / "Última vez vista" section heading (cartel + public
 * credential). Slashed inclusive form when sex is unknown. */
export function lastSeenHeadingLabel(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "Última vez visto";
    case "female":
      return "Última vez vista";
    default:
      return "Última vez visto/a";
  }
}

/** Cartel guard prompt when the pet is not lost yet, e.g. "Marcalo como
 * perdido primero para generar el cartel." Neutral rewords around the clitic. */
export function markLostFirstPrompt(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "Marcalo como perdido primero para generar el cartel.";
    case "female":
      return "Marcala como perdida primero para generar el cartel.";
    default:
      return "Reportá su pérdida primero para generar el cartel.";
  }
}

/**
 * Registration badge word on the pet credential, e.g. "Rocco **Inscripto**"
 * / "Michi **Inscripta**". QA histórico 2026-07-08 #2: the badge was
 * hardcoded feminine ("Inscripta"), disagreeing with a male pet's name
 * ("Rocco Inscripta"). Neutral "/a" (matching the existing roleLabel
 * "Dueño/a" convention) covers pets with no recorded sex.
 */
export function registeredAdjective(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "Inscripto";
    case "female":
      return "Inscripta";
    default:
      return "Inscripto/a";
  }
}

/**
 * Gender-agrees a `lib/ui/pet-situation.ts` situation label with the pet's
 * recorded sex. PET_SITUATIONS labels default to feminine (documented there
 * as "feminine default, matching the app's copy") because most situation
 * labels are invariant noun phrases ("En tratamiento", "En adopción") where
 * gender doesn't apply — only "Perdida" and "Fallecida" are adjectives that
 * must actually agree with the pet. "Preñada" is intentionally excluded:
 * pregnancy is exclusively a female state, so it never regenders.
 * QA histórico 2026-07-08 #2: swept the credential's situation skin for the
 * same masculine/feminine disagreement as the Inscripta badge.
 */
export function situationLabelForSex(label: string, sex: string | null | undefined): string {
  if (normalizeSex(sex) !== "male") return label;
  const MASCULINE_BY_FEMININE_LABEL: Record<string, string> = {
    Perdida: "Perdido",
    Fallecida: "Fallecido",
  };
  return MASCULINE_BY_FEMININE_LABEL[label] ?? label;
}

// Exhaustive map — must have exactly one entry per EventType.
// If you add a new entry to EVENT_TYPES, TypeScript will fail here until
// you add a corresponding label. Use `satisfies` so inference stays narrow.
const EVENT_TYPE_LABELS = {
  // Lifecycle
  pet_registered: "Mascota registrada",
  pet_profile_updated: "Perfil actualizado",
  status_changed: "Cambio de estado",
  death_recorded: "Fallecimiento",
  // Preventive medicine
  vaccination_administered: "Vacuna administrada",
  deworming_administered: "Antiparasitario",
  sterilization_performed: "Esterilización",
  // Medication
  medication_started: "Inicio de medicación",
  medication_stopped: "Fin de medicación",
  // Clinical encounters
  vet_visit_logged: "Visita al veterinario",
  // Body metrics
  weight_recorded: "Peso registrado",
  // Identification & legal
  microchip_implanted: "Microchip implantado",
  microchip_replaced: "Reemplazo de microchip",
  tattoo_recorded: "Tatuaje registrado",
  tattoo_updated: "Tatuaje actualizado",
  dangerous_breed_attested: "Atestación de raza peligrosa",
  // Free-form
  note_added: "Nota",
  // System / observed
  credential_scanned: "Credencial escaneada",
  incident_reported: "Incidente reportado",
  rabies_observation_started: "Observación antirrábica iniciada",
  rabies_observation_ended: "Observación antirrábica finalizada",
  // Medication adherence
  medication_dose_taken: "Dosis administrada",
  // Non-owner reporting
  symptom_observed: "Síntoma observado",
  abandonment_reported: "Abandono reportado",
  maltreatment_reported: "Maltrato reportado",
  // Unified clinical information
  clinical_info_logged: "Información clínica",
  // Custody & adoption
  shelter_intake_recorded: "Ingreso al refugio",
  foster_assigned: "Tránsito asignado",
  foster_ended: "Tránsito finalizado",
  adoption_application_submitted: "Postulación de adopción enviada",
  adoption_application_resolved: "Postulación de adopción resuelta",
  adoption_finalized: "Adopción finalizada",
  post_adoption_checkin: "Seguimiento post-adopción",
  adoption_reversed: "Adopción revertida",
  custody_transferred: "Custodia transferida",
  ownership_claimed: "Mascota reclamada",
  // Lost & Found
  custody_transfer_proposed: "Propuesta de devolución",
  custody_transfer_cancelled: "Propuesta de devolución cancelada",
  // Custody disputes
  custody_dispute_raised: "Disputa de custodia iniciada",
  custody_dispute_resolved: "Disputa de custodia resuelta",
  // Foster volunteers pool
  foster_proposed: "Propuesta de tránsito",
  foster_proposal_resolved: "Propuesta de tránsito resuelta",
  foster_co_foster_allowed: "Co-tránsito habilitado",
  // Adoption eligibility
  adoption_eligibility_set: "Elegibilidad para adopción actualizada",
  // Surveillance
  outbreak_signal: "Señal de brote",
  disease_reported: "Enfermedad reportada",
  // Jurisdictional mobility
  movement_recorded: "Movilidad registrada",
  // Correction by amendment — Wave 2 Item 15 (principle #2, 2026-06-19)
  event_amended: "Corrección registrada",
} satisfies Record<EventType, string>;

export function eventTypeLabel(eventType: EventType): string {
  return EVENT_TYPE_LABELS[eventType];
}

/**
 * Whole ARGENTINE calendar days elapsed from `date` to `now` (negative when
 * `date` is in the future). Compares `isoDateInAr` day strings — NOT elapsed
 * milliseconds: an event at 20:00 yesterday viewed at 10:00 today is only 14
 * elapsed hours, but it IS one calendar day ago. Elapsed-floor day math calls
 * that "hoy" (and calls 24–48h elapsed "ayer" even when it is two calendar
 * days back near midnight) — the exact bug class this helper replaces.
 */
export function calendarDaysAgoInAr(date: Date, now: Date = new Date()): number {
  const utcMidnightOfArDay = (d: Date) => Date.parse(`${isoDateInAr(d)}T00:00:00Z`);
  return Math.round((utcMidnightOfArDay(now) - utcMidnightOfArDay(date)) / 86_400_000);
}

/**
 * Calendar-day chip for a date (or a pre-computed AR "YYYY-MM-DD" day string):
 * "hoy", "ayer", or a compact "d/M" — the gob activity-feed dayChip pattern,
 * centralised. Day identity is the ARGENTINE calendar day (calendarDaysAgoInAr).
 */
export function relativeDayLabel(date: Date | string, now: Date = new Date()): string {
  const day = typeof date === "string" ? date : isoDateInAr(date);
  if (day === todayIsoInAr(now)) return "hoy";
  if (day === isoDateInAr(new Date(now.getTime() - 86_400_000))) return "ayer";
  const [, m, d] = day.split("-");
  return `${Number(d)}/${Number(m)}`;
}

export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "ahora";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  // Day-level labels are ARGENTINE-calendar-based (calendarDaysAgoInAr): the
  // old elapsed math said "hace 14 h" for 20:00-yesterday viewed at 10:00
  // today, and "ayer" for anything 24–48h old even when that lands two
  // calendar days back. Hour granularity applies only within the same AR day.
  const dayDiff = calendarDaysAgoInAr(date, now);
  if (dayDiff <= 0) return `hace ${Math.floor(diffMin / 60)} h`;
  if (dayDiff === 1) return "ayer";
  if (dayDiff < 7) return `hace ${dayDiff} días`;
  if (dayDiff < 30) return `hace ${Math.floor(dayDiff / 7)} sem`;
  return formatDate(date);
}

/**
 * Compact "hace Nd" formatter for operator-dense lists (e.g. outreach overdue
 * tables) where the day count itself is the prioritisation signal.
 *
 * Guards against absurd outputs:
 *  - null / NaN / epoch-sentinel (getTime() === 0, used for "no record") → "—"
 *  - <= 0 days → "hoy"
 *  - up to ~10 years → `hace Nd` (real overdue values stay legible: 400d, 900d…)
 *  - beyond ~10 years → absolute date, NEVER `hace 20624d`
 *
 * The 10-year cap exists because anything larger can only be a bad/sentinel
 * date, not a real "days since" value worth showing as a relative count.
 */
const RELATIVE_DAYS_ABSOLUTE_THRESHOLD = 3650; // ~10 years

export function relativeDaysShort(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  const t = date.getTime();
  if (Number.isNaN(t) || t === 0) return "—";
  // AR-calendar days, not elapsed-ms floor — 20:00 yesterday viewed at 10:00
  // today is "hace 1d", never "hoy" (calendarDaysAgoInAr rationale).
  const days = calendarDaysAgoInAr(date);
  if (days <= 0) return "hoy";
  if (days <= RELATIVE_DAYS_ABSOLUTE_THRESHOLD) return `hace ${days}d`;
  return formatDate(date);
}

export function notificationSeverityLabel(severity: string): string {
  switch (severity) {
    case "info":
      return "Info";
    case "success":
      return "Listo";
    case "warning":
      return "Atención";
    case "urgent":
      return "Urgente";
    default:
      return severity;
  }
}

// ---------------------------------------------------------------------------
// Phone normalization for tel: hrefs (UI-4 fix 6)
// ---------------------------------------------------------------------------
//
// Produces a dialable value for a tel: href from a raw, human-entered AR phone.
// Conservative: when confident, returns E.164 (+54…); otherwise returns the
// digits-only form so the link still dials something rather than choking on
// spaces/dashes/parens. The display string can keep its pretty form.
//
// Rules (best-effort, AR-centric):
//   - Already starts with "+": strip non-digits after the leading +, keep it.
//   - Starts with "00": treat as international prefix → "+" + rest.
//   - Starts with "0" (national trunk) or "15" handling is intentionally NOT
//     attempted (mobile 15 prefixes are ambiguous without an area code split);
//     we only confidently prepend +54 when the local number, after dropping a
//     single leading 0, has a plausible AR length (10 digits).
//   - Otherwise: return digits only (no guessing).
export function normalizePhoneForTel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // International, explicit "+".
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  }

  // International access code "00…" → "+…".
  if (trimmed.startsWith("00")) {
    const digits = trimmed.slice(2).replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // Already carries the AR country code.
  if (digits.startsWith("54")) {
    return `+${digits}`;
  }

  // National form with leading trunk "0": drop it. A plausible AR national
  // significant number is 10 digits (area code + subscriber). Only then are we
  // confident enough to stamp +54.
  if (digits.startsWith("0")) {
    const national = digits.replace(/^0+/, "");
    if (national.length === 10) return `+54${national}`;
    return national; // digits-only fallback — not confidently AR.
  }

  // Bare 10-digit national number (no trunk, no country code) → +54.
  if (digits.length === 10) return `+54${digits}`;

  // Anything else: conservative digits-only fallback.
  return digits;
}

// ---------------------------------------------------------------------------
// Death-cause labels (es-AR) — item 3.4 UX audit
//
// Maps DEATH_CAUSES enum values (English keys, from death-rules.ts) to their
// Spanish display labels. The underlying values are NEVER changed here.
// ---------------------------------------------------------------------------

const DEATH_CAUSE_LABELS: Record<string, string> = {
  known: "Causa conocida",
  unknown: "Causa desconocida",
  natural: "Muerte natural",
  disease: "Enfermedad",
  accident: "Accidente",
  euthanasia: "Eutanasia",
  sudden: "Muerte súbita",
  violent: "Causa violenta",
  other: "Otra causa",
};

/**
 * Returns the es-AR display label for a death cause value.
 * Falls back to the raw value if unrecognized (forward-compat).
 */
export function deathCauseLabel(cause: string | null | undefined): string {
  if (!cause) return "—";
  return DEATH_CAUSE_LABELS[cause] ?? cause;
}

// ---------------------------------------------------------------------------
// Disposition-method labels (es-AR) — item 3.4 UX audit
//
// Maps DispositionMethod enum values (English keys) to Spanish display labels.
// ---------------------------------------------------------------------------

const DISPOSITION_METHOD_LABELS: Record<string, string> = {
  cremation_collective: "Cremación colectiva",
  cremation_individual_ashes: "Cremación individual con cenizas",
  authorized_cemetery: "Cementerio habilitado",
  owner_burial: "Entierro en domicilio",
  household_waste: "Residuos domiciliarios",
  rendering: "Reciclaje sanitario",
  unknown: "Sin especificar",
};

/**
 * Returns the es-AR display label for a disposition method value.
 * Falls back to the raw value if unrecognized (forward-compat).
 */
export function dispositionMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return DISPOSITION_METHOD_LABELS[method] ?? method;
}

// ---------------------------------------------------------------------------
// Notification-type labels (es-AR) — item 3.4 UX audit
//
// Maps notification_type string values (English snake_case keys stored in DB)
// to human-readable Spanish labels for the NotificationCard chip.
// Only types that actually reach the notification surface are mapped here;
// any unknown type falls back gracefully to the raw code.
// ---------------------------------------------------------------------------

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  // Adoption
  adoption_application_approved: "Adopción aprobada",
  adoption_application_closed: "Adopción cerrada",
  adoption_application_received: "Postulación recibida",
  adoption_application_rejected: "Adopción rechazada",
  adoption_application_withdrawn: "Postulación retirada",
  adoption_finalized: "Adopción finalizada",
  adoption_info_requested: "Info de adopción solicitada",
  // Amendments
  admin_event_amended: "Evento corregido por admin",
  // Appointments
  appointment_cancelled_by_org: "Turno cancelado por la organización",
  appointment_cancelled_by_owner: "Turno cancelado",
  // Approval requests
  approval_request_approved: "Solicitud aprobada",
  approval_request_auto_expired: "Solicitud vencida automáticamente",
  approval_request_info_requested: "Más información solicitada",
  approval_request_pending_authority: "Solicitud pendiente de aprobación",
  approval_request_proposed_authority: "Nueva solicitud de aprobación",
  approval_request_rejected: "Solicitud rechazada",
  approval_request_submitted_self: "Solicitud enviada",
  // Bites
  bite_reported_authority: "Mordedura reportada a autoridad",
  bite_reported_by_org_owner: "Mordedura reportada por organización",
  // Capabilities
  capability_granted: "Permiso otorgado",
  capability_request: "Solicitud de permiso",
  capability_approved: "Permiso aprobado",
  capability_rejected: "Permiso rechazado",
  // Chip
  chip_match_notification_owner: "Coincidencia de microchip detectada",
  microchip_duplicate_detected: "Microchip duplicado detectado",
  microchip_fraud_detected: "Posible fraude de microchip",
  microchip_updated_by_institution: "Microchip actualizado por institución",
  // Cross-org transfers
  cross_org_transfer_accepted_receiver: "Transferencia aceptada",
  cross_org_transfer_accepted_sender: "Transferencia aceptada por receptor",
  cross_org_transfer_cancelled_receiver: "Transferencia cancelada",
  cross_org_transfer_proposed_receiver: "Propuesta de transferencia recibida",
  cross_org_transfer_proposed_sender: "Propuesta de transferencia enviada",
  cross_org_transfer_rejected_sender: "Transferencia rechazada",
  // Custody
  custody_dispute_party_added: "Disputa de custodia: parte agregada",
  custody_dispute_raised_against_you: "Disputa de custodia iniciada en tu contra",
  custody_dispute_raised_by_you: "Disputa de custodia iniciada por vos",
  custody_dispute_resolved: "Disputa de custodia resuelta",
  custody_dispute_stale: "Disputa de custodia sin movimiento",
  custody_received: "Custodia recibida",
  custody_transfer_accepted_owner_side: "Devolución aceptada por el dueño",
  custody_transfer_auto_cancelled: "Devolución cancelada automáticamente",
  custody_transfer_proposal_owner: "Propuesta de devolución",
  // Decomiso
  decomiso_confirmed_admin: "Decomiso confirmado (admin)",
  decomiso_confirmed_govt: "Decomiso confirmado",
  decomiso_handoff_accepted_govt: "Handoff de decomiso aceptado",
  decomiso_handoff_accepted_receiver: "Handoff de decomiso aceptado por receptor",
  decomiso_handoff_proposed_receiver: "Propuesta de handoff de decomiso recibida",
  decomiso_handoff_rejected_govt: "Handoff de decomiso rechazado",
  decomiso_handoff_stale: "Handoff de decomiso sin movimiento",
  decomiso_owner_lost_custody: "Animal decomisado — custodia transferida",
  // ENO / disease
  eno_disease_diagnosis: "Diagnóstico ENO registrado",
  eno_pet_disease_diagnosis: "Diagnóstico ENO en tu mascota",
  outbreak_signal_detected: "Señal de brote detectada",
  // Foster
  foster_assigned: "Tránsito asignado",
  foster_converted_to_owner: "Tránsito convertido en adopción",
  foster_ended: "Tránsito finalizado",
  foster_ended_by_adoption: "Tránsito finalizado por adopción",
  foster_ended_by_death: "Tránsito finalizado por fallecimiento",
  foster_ended_by_transfer: "Tránsito finalizado por transferencia",
  foster_proposal_accepted_org: "Propuesta de tránsito aceptada",
  foster_proposal_auto_cancelled_org: "Propuesta de tránsito cancelada automáticamente",
  foster_proposal_cancelled_volunteer: "Propuesta de tránsito cancelada por voluntario",
  foster_proposal_expired: "Propuesta de tránsito vencida",
  foster_proposal_received: "Propuesta de tránsito recibida",
  foster_proposal_rejected_org: "Propuesta de tránsito rechazada",
  foster_volunteer_reenroll_prompt: "Recordatorio para re-inscribirse como tránsito",
  // Govt / institutional
  admin_deactivated: "Cuenta admin desactivada",
  govt_deactivated: "Cuenta govt desactivada",
  govt_locality_assigned: "Localidad asignada",
  govt_locality_revoked: "Localidad revocada",
  govt_self_deactivated_admin_notice: "Auto-baja de operador govt",
  govt_self_deactivated_cascade_notice: "Cuenta govt dada de baja en cascada",
  institutional_account_created: "Cuenta institucional creada",
  operator_credentials_reset: "Credenciales de operador reseteadas",
  // Lost & Found
  lost_episode_resolved_broadcast: "Mascota encontrada — difusión",
  lost_episode_resolved_owner: "Mascota encontrada",
  lost_pet_broadcast: "Alerta de mascota perdida",
  // Taxonomy (tester fix #1): a sighting is NOT a hallazgo. New sighting rows
  // carry pet_sighting; pet_found_report stays mapped so pre-taxonomy rows
  // (old sightings AND found reports) keep rendering a sane label.
  pet_sighting: "Avistaje reportado",
  pet_found_report: "Reporte de mascota encontrada",
  pet_in_possession: "Mascota en posesión",
  // Org
  free_pet_claimed: "Mascota libre reclamada",
  org_invitation_accepted: "Invitación a organización aceptada",
  org_invitation_created: "Invitación a organización enviada",
  org_membership_removed: "Salida de la organización",
  org_verification_granted: "Verificación de organización otorgada",
  org_verification_revoked: "Verificación de organización revocada",
  // Pet transfers
  pet_transfer_accepted: "Transferencia de mascota aceptada",
  pet_transfer_cancelled: "Transferencia de mascota cancelada",
  pet_transfer_expired: "Transferencia de mascota vencida",
  pet_transfer_initiated: "Transferencia de mascota iniciada",
  pet_transfer_received: "Transferencia de mascota recibida",
  pet_transfer_rejected: "Transferencia de mascota rechazada",
  // Post-adoption
  post_adoption_checkin_due: "Seguimiento post-adopción pendiente",
  post_adoption_checkin_missed: "Seguimiento post-adopción no realizado",
  post_adoption_checkin_received: "Seguimiento post-adopción recibido",
  // PPP / breed rules
  ppp_breed_list_updated_now_applies: "Lista de razas PPP actualizada — aplica a tu mascota",
  ppp_registration_reminder: "Recordatorio: registrá tu mascota PPP",
  // Pregnancy
  pregnancy_ended_owner: "Gestación finalizada",
  pregnancy_started_owner: "Gestación registrada",
  // Profile
  profile_self_updated: "Perfil actualizado",
  self_resignation_confirmed: "Baja confirmada",
  stub_profile_claimed: "Perfil reclamado",
  // Rabies observation
  rabies_observation_completed_dead_authority: "Observación antirrábica: animal fallecido",
  rabies_observation_completed_negative_owner: "Observación antirrábica finalizada — negativo",
  rabies_observation_completed_professional_owner: "Observación antirrábica finalizada",
  rabies_observation_escalation_owner: "Observación antirrábica: requiere atención",
  rabies_observation_pending_review: "Observación antirrábica pendiente de revisión",
  rabies_observation_started_owner: "Observación antirrábica iniciada",
  // Revocations / service
  revocation_executed_org: "Revocación de verificación ejecutada",
  revocation_executed_vet: "Revocación de matrícula ejecutada",
  service_dog_credential_revoked: "Credencial de perro de asistencia revocada",
  service_offering_approved: "Servicio aprobado",
  service_offering_pending_authority: "Servicio pendiente de aprobación",
  service_offering_rejected: "Servicio rechazado",
  service_offering_submitted: "Servicio enviado para revisión",
  shelter_intake_confirmed: "Ingreso al refugio confirmado",
  // Welfare
  welfare_denuncia_stale_govt: "Denuncia de bienestar sin movimiento",
  welfare_org_intervention_note: "Nota de intervención de bienestar",
  welfare_org_intervention_returned: "Devolución post-intervención registrada",
  welfare_org_intervention_taken: "Mascota tomada en custodia por intervención",
  welfare_org_side_confirmed_reporter: "Denuncia de bienestar confirmada",
  welfare_org_side_critical_received: "Denuncia de bienestar crítica recibida",
  welfare_report_derived_to_org: "Denuncia derivada a organización",
  welfare_report_rederived_away: "Denuncia re-derivada a otra organización",
  welfare_report_status_changed: "Estado de denuncia actualizado",
  // Vaccines
  vaccine_due: "Vacuna próxima a vencer",
  // Rehome
  rehome_request_received: "Solicitud de re-hogar recibida",
  // Scans
  first_stranger_scan: "Primer escaneo de un desconocido",
  // Onboarding
  welcome: "Bienvenida",
};

/**
 * es-AR label for a rabies-observation close outcome. Short prose form used in
 * notification bodies so the owner never sees the raw enum value
 * ("outcome: negative"). Mirrors the option copy in CloseObservationForm.
 */
const RABIES_OUTCOME_LABELS: Record<string, string> = {
  negative: "resultado negativo (animal sano)",
  positive_rabies: "resultado positivo (rabia confirmada o sospechada)",
  dead: "fallecimiento durante la observación",
  lost_to_followup: "sin seguimiento (animal perdido o sin contacto)",
};

export function rabiesObservationOutcomeLabel(outcome: string | null | undefined): string {
  if (!outcome) return "resultado no especificado";
  return RABIES_OUTCOME_LABELS[outcome] ?? outcome;
}

/**
 * Returns the es-AR human label for a notification_type code.
 * Falls back to the raw code for unknown types (forward-compat).
 */
export function notificationTypeLabel(notificationType: string | null | undefined): string {
  if (!notificationType) return "—";
  return NOTIFICATION_TYPE_LABELS[notificationType] ?? notificationType;
}

/**
 * Cap a potentially large count for display so alarming raw numbers are not
 * surfaced to owners (UX 3.5 item 6). Returns a string: the number itself
 * when ≤ cap, or "${cap}+" when above. Default cap is 99.
 *
 * @example capCount(264)  // "99+"
 * @example capCount(5)    // "5"
 * @example capCount(99)   // "99"
 * @example capCount(100)  // "99+"
 */
export function capCount(n: number, cap = 99): string {
  return n > cap ? `${cap}+` : String(n);
}

// ---------------------------------------------------------------------------
// Numeric KPI / metric formatters (es-AR) — KPI precision audit 2026-07-07
// ---------------------------------------------------------------------------
//
// The operator + government dashboards render percentages, rates, and counts.
// es-AR uses a COMMA decimal separator and a DOT thousands separator
// ("1.982", "41,3%"). A bare template literal (`${x}%`) and `toFixed()` both
// emit a DOT decimal ("41.3%") — the WRONG locale. Every KPI/metric display
// MUST route through these helpers instead of formatting inline.
//
// Precision rules (PO KPI-precision directive):
//   - Percentages: 1 decimal ("41,3%"); exactly 0 or 100 render clean.
//   - Rates (per 10k, per capita) and averages/durations: 1 decimal.
//   - Counts: integer, thousands-separated — never a fake decimal.
//   - Deltas: same precision as their base metric, with an explicit sign.
//
// Precision must SURVIVE to this layer: fetchers return full-precision numbers
// and the DISPLAY decides how many decimals to show. Do NOT round a percentage
// to a whole integer in the fetcher — that discards the decimal before it can
// ever reach a formatter.

const AR_COUNT_FORMAT = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** Cache one fixed-decimal es-AR formatter per decimal count (usually 1). */
const arDecimalFormatters = new Map<number, Intl.NumberFormat>();
function arDecimalFormat(decimals: number): Intl.NumberFormat {
  let fmt = arDecimalFormatters.get(decimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    arDecimalFormatters.set(decimals, fmt);
  }
  return fmt;
}

/** es-AR integer with a thousands separator ("1.982"). Non-finite → "—". */
export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return AR_COUNT_FORMAT.format(Math.round(value));
}

/**
 * es-AR percentage, 1 decimal by default ("41,3%"). Exactly 0 or 100 render
 * clean ("0%" / "100%"). Non-finite → "—". `value` is a 0–100 percentage,
 * NOT a 0–1 fraction.
 */
export function formatPercent(
  value: number | null | undefined,
  options: { decimals?: number } = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const { decimals = 1 } = options;
  if (value === 0) return "0%";
  if (value === 100) return "100%";
  return `${arDecimalFormat(decimals).format(value)}%`;
}

/**
 * es-AR decimal rate WITHOUT a unit suffix, 1 decimal by default ("3,5"). For
 * per-10k / per-capita rates and averages/durations (días promedio); the caller
 * appends the unit label. Non-finite → "—".
 */
export function formatRate(
  value: number | null | undefined,
  options: { decimals?: number } = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const { decimals = 1 } = options;
  return arDecimalFormat(decimals).format(value);
}

/**
 * es-AR signed delta ("+2,4", "-1,0", "0,0"). Precision matches the base metric
 * via `decimals` (default 1); `unit` appends a suffix ("pp", "%"). Non-finite →
 * "—".
 */
export function formatDelta(
  value: number | null | undefined,
  options: { decimals?: number; unit?: string } = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const { decimals = 1, unit = "" } = options;
  const fmt = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: "exceptZero",
  });
  return `${fmt.format(value)}${unit}`;
}

// ---------------------------------------------------------------------------
// Spanish pluralization (Wave M)
// ---------------------------------------------------------------------------
//
// Dozens of surfaces inlined `${n} evento${n === 1 ? "" : "s"}`-shaped
// ternaries — each one a chance to pick the wrong suffix ("señals",
// "animals") or drift in wording. This is the ONE place count-agreement
// lives; scripts/check-pluralize-es.ts bans new ad-hoc ternaries.

/**
 * Pluralize a Spanish noun by count: returns `singular` when `n === 1`, else
 * the plural form.
 *
 * Default plural (when `plural` is omitted) follows the regular rules:
 *   - ends in "z"  → "-ces"  ("vez" → "veces")
 *   - ends in a vowel (incl. accented) → "+s" ("evento" → "eventos")
 *   - otherwise → "+es" ("señal" → "señales", "mes" → "meses")
 *
 * Pass `plural` explicitly for irregulars the rules cannot derive — accent
 * shifts ("camión" → "camiones"), invariants ("lunes" → "lunes"), or
 * multi-word phrases ("regla provincial" → "reglas provinciales").
 */
export function pluralizeEs(n: number, singular: string, plural?: string): string {
  if (n === 1) return singular;
  if (plural !== undefined) return plural;
  if (/z$/i.test(singular)) return `${singular.slice(0, -1)}ces`;
  if (/[aeiouáéíóú]$/i.test(singular)) return `${singular}s`;
  return `${singular}es`;
}

export function ageFromDateOfBirth(dateOfBirth: string | null | undefined): string | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  if (months < 0 || (months === 0 && now.getDate() < dob.getDate())) {
    years -= 1;
    months += 12;
  }
  if (years > 0) {
    return `${years} ${pluralizeEs(years, "año")}`;
  }
  if (months > 0) {
    return `${months} ${pluralizeEs(months, "mes")}`;
  }
  return "menos de un mes";
}
