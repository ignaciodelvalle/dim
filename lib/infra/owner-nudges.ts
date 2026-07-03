// Owner health-status nudges for /inicio (Item 5).
//
// Spec: docs/superpowers/specs/2026-06-18-owner-health-status-nudges-design.md
// Umbrella: docs/superpowers/specs/2026-06-18-metrics-ia-handoff-design.md (§6).
//
// PRIVACY CONTRACT (non-negotiable, umbrella §6 + spec D1):
//   These nudges are derived EXCLUSIVELY from the OWNER'S OWN pets, events and
//   reminders. They MUST NOT read outbreak_signal, disease_reported, or any
//   cross-pet / surveillance / authority signal. Nothing here surfaces a
//   diagnosis or an enforcement notice to the owner — copy stays supportive
//   (spec D4). Dangerous-zoonosis owner alerts are a separate SME-gated spec.
//
// DERIVE, DON'T STORE (spec D2): every value is computed on read from existing
// events/reminders. No new column, no new event type, no migration.
//
// Shape: fetchPetHealthNudges(ownerId) → one PetHealthStatus per active pet the
// owner owns (role='owner'), each carrying the derived flags + a per-pet nudge
// list + a rollup summary ("Sin pendientes" vs "N pendientes"). Like the rest of
// lib/owner-dashboard.ts, this function MUST NOT throw — it returns an empty
// array when the owner has nothing.

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db, ownerships, petEvents, pets, reminders } from "@/db";
import { overlayAmendments } from "@/lib/infra/amendment";
import { replayPetMicrochip } from "@/lib/projections/pet-microchip";
import type { ProjectionEvent } from "@/lib/projections/types";

// Event types this derivation reads. Owner-data only — deliberately excludes
// every surveillance/authority event type (outbreak_signal, disease_reported,
// symptom_observed, …). Adding a surveillance type here would violate the
// umbrella §6 privacy contract.
const NUDGE_EVENT_TYPES = [
  "vaccination_administered",
  "microchip_implanted",
  "sterilization_performed",
  "credential_scanned",
  // Corrections — fetched so overlayAmendments projects corrected payloads
  // (e.g. an amended next_due_at) before deriveVaccineStatus reads them
  // (projection-cron audit 2026-07-03 A).
  "event_amended",
] as const;

// Scans within this window count toward the "credential activity" nudge.
const SCAN_ACTIVITY_WINDOW_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VaccineStatus = "up_to_date" | "overdue" | "unknown";

export type NudgeKind =
  | "vaccine_overdue"
  | "chip_missing"
  | "scan_activity"
  | "sterilization_pending";

/**
 * A single owner-facing nudge. Encouraging, never alarming (spec D4).
 * `actionHref` points at the owner's own action surface (schedule / capture /
 * credential), never at an authority view.
 */
export type Nudge = {
  kind: NudgeKind;
  /** Supportive one-liner shown on the strip. */
  label: string;
  /** Where the owner goes to act on it. */
  actionHref: string;
  /** Drives dot color only — informational nudges stay neutral. */
  tone: "neutral" | "attention";
};

export type PetHealthStatus = {
  petId: string;
  publicToken: string;
  name: string;
  species: string;
  vaccineStatus: VaccineStatus;
  hasChip: boolean;
  isSterilized: boolean;
  openReminders: number;
  recentScanCount: number;
  nudges: Nudge[];
  /** Count of action-required nudges (the "pendientes" rollup). */
  pendingCount: number;
  /** Human rollup: "Sin pendientes" when nothing pending, "N pendientes" otherwise. */
  summary: string;
};

// ---------------------------------------------------------------------------
// Internal row shapes
// ---------------------------------------------------------------------------

type OwnerPetRow = {
  petId: string;
  publicToken: string;
  name: string;
  species: string;
};

type OpenReminderRow = {
  petId: string;
  title: string;
  dueAt: Date;
};

// ---------------------------------------------------------------------------
// Derivation (pure — fully unit-testable, no DB)
// ---------------------------------------------------------------------------

/**
 * Latest vaccination_administered event wins; its next_due_at vs `now`
 * decides the status. No vaccine on record → "unknown" (we do NOT nudge an
 * owner who simply hasn't logged a vaccine yet — that's not an overdue signal,
 * and over-nudging erodes trust; the reminder system handles the prompt).
 */
export function deriveVaccineStatus(events: ProjectionEvent[], now: Date): VaccineStatus {
  let latestDueAt: number | null = null;
  let latestOccurred = Number.NEGATIVE_INFINITY;
  let sawVaccine = false;
  for (const e of events) {
    if (e.eventType !== "vaccination_administered") continue;
    sawVaccine = true;
    const occurred = toTime(e.occurredAt);
    if (occurred < latestOccurred) continue;
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    const nextDue = typeof payload.next_due_at === "string" ? payload.next_due_at : null;
    latestOccurred = occurred;
    latestDueAt = nextDue ? new Date(nextDue).getTime() : null;
  }
  if (!sawVaccine) return "unknown";
  if (latestDueAt === null) return "unknown"; // logged, but no due date → can't judge
  return latestDueAt < now.getTime() ? "overdue" : "up_to_date";
}

function hasEventOfType(events: ProjectionEvent[], type: string): boolean {
  return events.some((e) => e.eventType === type);
}

function countRecentExternalScans(events: ProjectionEvent[], now: Date): number {
  const cutoff = now.getTime() - SCAN_ACTIVITY_WINDOW_DAYS * MS_PER_DAY;
  let n = 0;
  for (const e of events) {
    if (e.eventType !== "credential_scanned") continue;
    if (toTime(e.occurredAt) < cutoff) continue;
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    // Exclude the owner scanning their own credential (is_self_scan=true).
    if (payload.is_self_scan === true) continue;
    n += 1;
  }
  return n;
}

/**
 * Build the per-pet status + nudge list from that pet's own events and its open
 * reminder count. Pure: caller supplies events + reminders already scoped to
 * the pet. This is the heart of the contract and is independently testable.
 */
export function derivePetHealthStatus(
  pet: OwnerPetRow,
  events: ProjectionEvent[],
  openReminders: OpenReminderRow[],
  now: Date,
): PetHealthStatus {
  const vaccineStatus = deriveVaccineStatus(events, now);
  // replayPetMicrochip returns a non-null microchipId only when an
  // microchip_implanted event with a chip_number exists.
  const hasChip = replayPetMicrochip(events).microchipId !== null;
  const isSterilized = hasEventOfType(events, "sterilization_performed");
  const recentScanCount = countRecentExternalScans(events, now);

  const nudges: Nudge[] = [];

  if (vaccineStatus === "overdue") {
    nudges.push({
      kind: "vaccine_overdue",
      label: "Vacuna vencida — agendá un turno",
      actionHref: `/mis-mascotas/${pet.publicToken}/eventos/nuevo/vacuna`,
      tone: "attention",
    });
  }

  if (!hasChip) {
    nudges.push({
      kind: "chip_missing",
      label: "Sin microchip registrado — registralo cuando lo tengas",
      actionHref: `/mis-mascotas/${pet.publicToken}/eventos/nuevo/microchip`,
      tone: "attention",
    });
  }

  // The reminder_due nudge was removed (projection-cron audit 2026-07-03 C3,
  // PO decision): it read the same reminders the Vencimientos card lists on
  // the SAME /inicio screen — a third copy of one fact. openReminders still
  // feeds the returned counters; the reminder workflow lives in Vencimientos.

  // Credential-scan activity is informational (neutral) — "tu credencial fue
  // escaneada N veces" is a positive, owner-only signal (someone is using the
  // QR), NOT a surveillance read.
  if (recentScanCount > 0) {
    nudges.push({
      kind: "scan_activity",
      label:
        recentScanCount === 1
          ? "Tu credencial fue escaneada 1 vez"
          : `Tu credencial fue escaneada ${recentScanCount} veces`,
      actionHref: `/mis-mascotas/${pet.publicToken}`,
      tone: "neutral",
    });
  }

  // pendingCount = nudges that ask the owner to DO something. The neutral
  // scan-activity nudge is informational and does not count as "pendiente".
  const pendingCount = nudges.filter((n) => n.tone === "attention").length;
  // "Sin pendientes", not "Al día" — AL DÍA is a compliance claim owned by
  // deriveComplianceState (QA round 2 2026-07-03 #4); this rollup only says
  // no actionable nudges remain.
  const summary = pendingCount === 0 ? "Sin pendientes" : `${pendingCount} pendientes`;

  return {
    petId: pet.petId,
    publicToken: pet.publicToken,
    name: pet.name,
    species: pet.species,
    vaccineStatus,
    hasChip,
    isSterilized,
    openReminders: openReminders.length,
    recentScanCount,
    nudges,
    pendingCount,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Data layer (DB read → pure derivation)
// ---------------------------------------------------------------------------

/**
 * Per-pet health-status nudges for the owner's landing page (/inicio).
 *
 * Scope: pets the user owns with role='owner' and an open ownership
 * (ended_at IS NULL), excluding deceased pets. All reads are scoped to that
 * owner — owner A can never see owner B's pets.
 *
 * Three indexed reads, then pure per-pet derivation:
 *   1. the owner's active pets,
 *   2. their nudge-relevant events (whitelisted types only — owner data),
 *   3. their open (non-completed) vaccine reminders.
 *
 * Never throws — returns [] when the owner has no pets.
 */
export async function fetchPetHealthNudges(ownerId: string): Promise<PetHealthStatus[]> {
  // 1. Owner's active pets.
  const petRows = await db
    .select({
      petId: pets.id,
      publicToken: pets.publicToken,
      name: pets.name,
      species: pets.species,
      status: pets.status,
    })
    .from(ownerships)
    .innerJoin(pets, eq(pets.id, ownerships.petId))
    .where(
      and(
        eq(ownerships.ownerUserId, ownerId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    );

  const ownerPets: OwnerPetRow[] = petRows
    .filter((r) => r.status !== "deceased")
    .map((r) => ({
      petId: r.petId,
      publicToken: r.publicToken,
      name: r.name,
      species: r.species,
    }));

  if (ownerPets.length === 0) return [];

  const petIds = ownerPets.map((p) => p.petId);

  // 2. Nudge-relevant events for those pets (whitelisted types). The pets join
  //    re-scopes by ownership so this read can't leak another owner's events.
  const eventRows = await db
    .select({
      petId: petEvents.petId,
      id: petEvents.id,
      eventType: petEvents.eventType,
      occurredAt: petEvents.occurredAt,
      recordedAt: petEvents.recordedAt,
      payload: petEvents.payload,
    })
    .from(petEvents)
    .innerJoin(ownerships, eq(ownerships.petId, petEvents.petId))
    .where(
      and(
        eq(ownerships.ownerUserId, ownerId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
        inArray(petEvents.eventType, [...NUDGE_EVENT_TYPES]),
      ),
    )
    .orderBy(asc(petEvents.occurredAt));

  // 3. Open (non-completed) vaccine reminders, scoped to the owner.
  const reminderRows = await db
    .select({
      petId: reminders.petId,
      title: reminders.title,
      dueAt: reminders.dueAt,
    })
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, ownerId),
        eq(reminders.reminderType, "vaccine"),
        isNull(reminders.completedAt),
      ),
    );

  // Project corrections, then group events + reminders by pet (D2 at the
  // read boundary — projection-cron audit 2026-07-03 A).
  const eventsByPet = new Map<string, ProjectionEvent[]>();
  for (const r of overlayAmendments(eventRows)) {
    const list = eventsByPet.get(r.petId) ?? [];
    list.push({
      id: r.id,
      eventType: r.eventType,
      occurredAt: r.occurredAt,
      recordedAt: r.recordedAt,
      payload: r.payload,
    });
    eventsByPet.set(r.petId, list);
  }

  const remindersByPet = new Map<string, OpenReminderRow[]>();
  for (const r of reminderRows) {
    const list = remindersByPet.get(r.petId) ?? [];
    list.push({ petId: r.petId, title: r.title, dueAt: r.dueAt });
    remindersByPet.set(r.petId, list);
  }

  const now = new Date();
  return ownerPets.map((pet) =>
    derivePetHealthStatus(
      pet,
      eventsByPet.get(pet.petId) ?? [],
      remindersByPet.get(pet.petId) ?? [],
      now,
    ),
  );
}

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
