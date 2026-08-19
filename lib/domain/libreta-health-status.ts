// Health-status snapshot for the libreta sanitaria dashboard.
//
// Pure helpers — no DB calls. Callers pass already-fetched events + the
// pet row; this module derives counts for the four KPI cards that sit
// above the libreta sections:
//
//   • Vacunación vigente   — count of core vaccines that have a recent
//                            enough vaccination_administered event
//   • Vencidas / por vencer — derived from the same vaccine snapshot
//   • Condiciones permanentes — already on the pet row, surfaced as a list
//   • Medicación activa     — medication_started events that have NOT been
//                            followed by a medication_stopped for the
//                            same drug name

import { findVaccineByName, vaccinesForSpecies } from "@/lib/reference/lookups";

export type VaccineSnapshot = {
  /** Catalog display name. */
  vaccineName: string;
  /** When the last dose was administered, if any. */
  lastDoseAt: Date | null;
  /** Catalog-derived next due date (null when the vaccine has no interval). */
  nextDueAt: Date | null;
  /**
   * Lifecycle classification — what the dashboard chip needs:
   *   active      — vaccine has a dose, next due is in the future
   *   due_soon    — next due within 30 days (still active but warn the owner)
   *   expired     — last dose is older than intervalMonths
   *   missing     — core vaccine for this species, never administered, AND
   *                 nothing on file could plausibly be it
   *   unconfirmed — core vaccine with no MATCHED dose, while the animal carries
   *                 one or more doses whose free-text name is not in the
   *                 catalog. We cannot say it was applied. We must not say it
   *                 was not. See the note on `unconfirmed` below.
   */
  status: "active" | "due_soon" | "expired" | "missing" | "unconfirmed";
};

export type VaccinationSummary = {
  active: number;
  dueSoon: number;
  expired: number;
  missing: number;
  /**
   * Core vaccines with no MATCHED dose, on an animal that DOES carry doses the
   * catalog could not resolve. Split out of `missing` (PO decision 2026-07-28)
   * because the two make different claims: `missing` says "never given",
   * `unconfirmed` says "we cannot tell". Surfacing them as one number is what
   * let the libreta report a matrícula-signed dose as absent.
   */
  unconfirmed: number;
  /**
   * Count of DISTINCT vaccines administered whose name is NOT in the species
   * catalog (free-text names entered in the attendance/registro forms). These
   * do not affect core-vaccine status (al día / atención) but must remain
   * VISIBLE so the dose is not silently dropped. Deduped by normalized name —
   * multiple doses of the same off-catalog vaccine count once.
   */
  otherCount: number;
  /** Per-vaccine detail in catalog order. */
  perVaccine: VaccineSnapshot[];
};

export type MedicationActive = {
  /** Event id of the medication_started that opened the treatment. */
  startEventId: string;
  /** Drug name from the started event's payload. */
  drug: string;
  /** When the treatment started. */
  startedAt: Date;
};

export type LibretaHealthStatus = {
  vaccinations: VaccinationSummary;
  /** Names of permanent conditions (matches db column shape). */
  permanentConditions: string[];
  /** Free-text "other" condition supplied by the owner, if any. */
  permanentConditionsOther: string | null;
  /** Open medication treatments (started without a matching stop). */
  medicationsActive: MedicationActive[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
// Default tier of the `due_soon_window` business rule (admin-rules-console) —
// live resolution happens in the server caller; see computeVaccinationSummary.
const DUE_SOON_WINDOW_DAYS = 30;

type AnyEvent = {
  eventType: string;
  occurredAt: Date | string;
  payload: unknown;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Add a whole number of CALENDAR months to a date (like census.classifyDormant).
 * `intervalMonths * 30 * DAY_MS` treats every month as 30 days, so a 12-month
 * vaccine expired at 360 days — ~5 days before its real calendar-year due date
 * (PJ-M2). setMonth honors real month lengths and year rollover.
 */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * The next-dose date a capture form should SUGGEST for a dose applied on
 * `occurredAt` (a `YYYY-MM-DD` value straight out of an `<input type="date">`).
 * Returns `""` when there is nothing to suggest — no interval for this vaccine,
 * or an incomplete/invalid date the user is still typing.
 *
 * Lives here, next to `addMonths`, because the SERVER derives the same value
 * the same way when a dose arrives without an explicit `next_due_at`
 * (`derivedNextDue` in computeVaccinationSummary). Two calendars would mean the
 * form promises one booster date and the libreta shows another.
 *
 * Blind QA 2026-08-19 (O5) is why it takes `occurredAt` at all: the vaccine
 * sheet counted the interval from `new Date()` and never recomputed when the
 * application date changed, so backdating a rabies dose to yesterday left the
 * suggestion at today+12mo. One day off for a backdated day; a year off for a
 * dose loaded a year late.
 *
 * Parsed and formatted in LOCAL time, matching `addMonths`'s own `setMonth`
 * semantics — a UTC round-trip on a bare date string is what slips a day
 * under a negative offset (es-AR is UTC-3).
 */
export function suggestNextDueDate(occurredAt: string, intervalMonths: number | null): string {
  if (intervalMonths === null) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(occurredAt);
  if (!m) return "";
  const [, y, mo, d] = m;
  const parsed = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(parsed.getTime())) return "";
  const due = addMonths(parsed, intervalMonths);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
}

/**
 * Build the per-vaccine snapshot for a pet. For every core vaccine of the
 * pet's species (and every non-core vaccine that has at least one event),
 * we find the latest vaccination_administered event and classify it.
 *
 * `dueSoonWindowDays` (admin-rules-console, promoted from the module-level
 * DUE_SOON_WINDOW_DAYS constant, design ADR-4 item 2) is resolved by the
 * SERVER CALLER via `resolveBusinessRule("due_soon_window", pet jurisdiction)`
 * and threaded in here as a plain param — this function stays pure/sync
 * rather than becoming async or importing the resolver (which would pull
 * `db` into every consumer of this domain module, including tests). Defaults
 * to the constant so existing callers that don't pass it see zero behavior
 * change.
 */
export function computeVaccinationSummary(
  events: readonly AnyEvent[],
  species: string,
  now: Date = new Date(),
  dueSoonWindowDays: number = DUE_SOON_WINDOW_DAYS,
): VaccinationSummary {
  // Latest event per vaccine name (case-insensitive match against the catalog).
  const latestByVaccine = new Map<string, { occurredAt: Date; nextDueAt: Date | null }>();
  // Distinct off-catalog (free-text) vaccine names, normalized for dedupe.
  // These don't change core-vaccine status but must stay visible — counting
  // them here is what keeps free-text doses from silently vanishing.
  const otherNames = new Set<string>();
  for (const e of events) {
    if (e.eventType !== "vaccination_administered") continue;
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    const rawName = typeof payload.vaccine_name === "string" ? payload.vaccine_name : null;
    if (!rawName) continue;
    const def = findVaccineByName(rawName);
    if (!def) {
      // Free-text vaccine outside the catalog — count it (deduped by name) so
      // it appears in the libreta instead of disappearing. We deliberately do
      // NOT fuzzy-match against the catalog.
      const normalized = rawName.trim().toLowerCase();
      if (normalized) otherNames.add(normalized);
      continue;
    }
    const occurredAt = asDate(e.occurredAt);
    if (!occurredAt) continue;
    const payloadNextDue = asDate((payload.next_due_at ?? null) as Date | string | null);
    const derivedNextDue =
      payloadNextDue ??
      (def.intervalMonths !== null ? addMonths(occurredAt, def.intervalMonths) : null);
    const existing = latestByVaccine.get(def.name);
    if (!existing || existing.occurredAt < occurredAt) {
      latestByVaccine.set(def.name, { occurredAt, nextDueAt: derivedNextDue });
    }
  }

  // Core vaccines for this species always surface (so missing ones are
  // visible). Non-core vaccines surface only when the owner has logged at
  // least one dose, so we don't dilute the headline with shots most pets
  // never need.
  const candidates = new Map(
    vaccinesForSpecies(species)
      .filter((v) => v.isCore)
      .map((v) => [v.name, v]),
  );
  for (const name of latestByVaccine.keys()) {
    if (!candidates.has(name)) {
      const def = findVaccineByName(name);
      if (def) candidates.set(name, def);
    }
  }

  // At least one dose on file whose name the catalog could not resolve. While
  // this is true, an unmatched core vaccine cannot be reported as never given —
  // one of these doses may BE it.
  const hasUnidentifiedDoses = otherNames.size > 0;

  const perVaccine: VaccineSnapshot[] = [];
  for (const def of candidates.values()) {
    const latest = latestByVaccine.get(def.name) ?? null;
    if (!latest) {
      // Reached only for core vaccines (non-cores without a dose were filtered
      // out above). "missing" is an ASSERTION — it tells an owner their animal
      // never got this vaccine — and it is only defensible when nothing on file
      // could plausibly be it.
      //
      // The catalog entry is "Séxtuple (DHPPi-L)"; a vet signed a dose named
      // "Séxtuple". findVaccineByName is exact equality, so the signed dose
      // landed in `otherNames` and this core entry reported `missing` — the
      // libreta told the owner "2 vacunas del calendario recomendado sin
      // aplicar" roughly five centimetres above the matrícula-signed record of
      // one of them (live review 2026-07-28).
      //
      // PO decision 2026-07-28: keep exact matching — fuzzy-matching a medical
      // record risks asserting a vaccine nobody gave, which is the worse error
      // — but never assert the ABSENCE while an unidentified dose is on file.
      // `unconfirmed` says what is actually known: we cannot match it, so we
      // are not going to claim either way. (The vet-facing gate does fuzzy-
      // match at 0.85; there it is a SUGGESTION a professional confirms, here
      // it would be an assertion to an owner who cannot.)
      perVaccine.push({
        vaccineName: def.name,
        lastDoseAt: null,
        nextDueAt: null,
        status: hasUnidentifiedDoses ? "unconfirmed" : "missing",
      });
      continue;
    }
    const nextDueAt = latest.nextDueAt;
    if (!nextDueAt) {
      perVaccine.push({
        vaccineName: def.name,
        lastDoseAt: latest.occurredAt,
        nextDueAt: null,
        status: "active",
      });
      continue;
    }
    const msUntilDue = nextDueAt.getTime() - now.getTime();
    let status: VaccineSnapshot["status"];
    if (msUntilDue < 0) status = "expired";
    else if (msUntilDue < dueSoonWindowDays * DAY_MS) status = "due_soon";
    else status = "active";
    perVaccine.push({
      vaccineName: def.name,
      lastDoseAt: latest.occurredAt,
      nextDueAt,
      status,
    });
  }

  let active = 0;
  let dueSoon = 0;
  let expired = 0;
  let missing = 0;
  let unconfirmed = 0;
  for (const v of perVaccine) {
    if (v.status === "active") active++;
    else if (v.status === "due_soon") dueSoon++;
    else if (v.status === "expired") expired++;
    else if (v.status === "unconfirmed") unconfirmed++;
    else missing++;
  }

  return {
    active,
    dueSoon,
    expired,
    missing,
    unconfirmed,
    otherCount: otherNames.size,
    perVaccine,
  };
}

/**
 * True when the pet has at least ONE registered vaccine dose (catalog or
 * off-catalog). A pet with zero records must render a "sin vacunas
 * registradas" empty state — never a fabricated count (staging validation
 * 2026-07-04, bug 3: a fresh pet showed "3 POR VENCER" because catalog-core
 * vaccines with no dose were folded into the "por vencer" bucket).
 *
 * SINGLE SHARED PREDICATE: both the owner libreta (VacunasStatusBadges) and
 * the public share view (Tier2MedicalView via /p/[publicToken]) must gate
 * their empty state on this function so the two surfaces can never disagree.
 */
export function hasAnyVaccineRecord(summary: VaccinationSummary): boolean {
  return summary.active + summary.dueSoon + summary.expired > 0 || summary.otherCount > 0;
}

/**
 * Open medication treatments — medication_started events that don't have a
 * matching medication_stopped event referencing them via
 * payload.medication_started_event_id. Returns them oldest first so the
 * dashboard renders the longest-running treatment at the top.
 */
export function computeMedicationsActive(
  events: ReadonlyArray<AnyEvent & { id: string }>,
): MedicationActive[] {
  // Set of started-event ids that have been closed by a stop.
  const stoppedIds = new Set<string>();
  for (const e of events) {
    if (e.eventType !== "medication_stopped") continue;
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    const startedId =
      typeof payload.medication_started_event_id === "string"
        ? payload.medication_started_event_id
        : null;
    if (startedId) stoppedIds.add(startedId);
  }

  const open: MedicationActive[] = [];
  for (const e of events) {
    if (e.eventType !== "medication_started") continue;
    if (stoppedIds.has(e.id)) continue;
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    const drugRaw = typeof payload.drug_name === "string" ? payload.drug_name : null;
    const occurredAt = asDate(e.occurredAt);
    if (!drugRaw || !occurredAt) continue;
    open.push({ startEventId: e.id, drug: drugRaw.trim(), startedAt: occurredAt });
  }

  // Oldest first.
  open.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  return open;
}

/**
 * Assemble the full dashboard snapshot. `pet` carries the permanent
 * conditions (already on the row); `events` is the libreta-scoped event
 * stream the page already loads.
 */
export function computeLibretaHealthStatus(
  pet: {
    species: string;
    permanentConditions: readonly string[] | null;
    permanentConditionsOther: string | null;
  },
  events: ReadonlyArray<AnyEvent & { id: string }>,
  now: Date = new Date(),
): LibretaHealthStatus {
  return {
    vaccinations: computeVaccinationSummary(events, pet.species, now),
    permanentConditions: [...(pet.permanentConditions ?? [])],
    permanentConditionsOther: pet.permanentConditionsOther,
    medicationsActive: computeMedicationsActive(events),
  };
}
