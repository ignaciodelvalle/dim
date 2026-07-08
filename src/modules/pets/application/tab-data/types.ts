// Use-case types for pet tab-data loaders (strangler migration 25/61).
//
// The former Libreta/Vacunas/Historial panel types (LibretaTabData,
// VacunasTabData, HistorialTabData, LibretaEventRow) were removed with their
// use-cases in the two-face redesign (2026-07-01, Phase 4) — superseded by
// LibretaFaceData below. `LibretaHealthStatus`/`VaccinationSummary` stay
// imported from lib/domain because computeVaccinationSummary is still used
// here; `computeLibretaHealthStatus` has no remaining caller after this
// cleanup but lives in a shared file with computeVaccinationSummary so it was
// not deleted (out of scope for this batch — see apply-progress risk notes).

import type { FutureLedgerItem } from "@/components/pet-profile/libreta-future.helpers";
import type { LibretaShareToken } from "@/db";
import type { VaccinationSummary } from "@/lib/domain/libreta-health-status";

// ---------------------------------------------------------------------------
// Past event row (used by the Libreta face's `past` list below)
// ---------------------------------------------------------------------------

export type HistorialEventRow = {
  id: string;
  petId: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date;
  notes: string | null;
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
  /**
   * Display name of the signing organization (resolved from
   * authorOrganizationId in the loader). Drives the "Aplicó" attribution for
   * org/vet-signed records so it can never contradict the provenance stamp
   * (staging validation 2026-07-04: vet-signed vaccine read "Declarado por el
   * titular" next to a "Verificado por vet" badge).
   */
  authorOrgName?: string | null;
  /**
   * Matrícula stamped on the event row (SENASA columns, migration 0061).
   * NULL for legacy rows and writers that don't capture it; when present a
   * vet-signed record can attribute "Vet. M.N. XXX" precisely.
   */
  vetMatricula?: string | null;
  attachmentUrl: string | null;
  // Set when a later `event_amended` event corrects this one — drives the
  // "Corregido · ver original" affordance (WS-3). Enriched in the tab-data shim.
  amendedAt?: Date | null;
};

// ---------------------------------------------------------------------------
// Libreta face (Face 2 — two-face redesign, 2026-07-01)
//
// Merges the former Libreta/Vacunas/Historial tab-data shapes above into one
// deferred query batch (ADR-4, design.md). `activeShares` is only populated
// for accessPath === "owner" — SharesManager stays owner-gated even though
// the read guard now also allows org-path viewers (lens-clamped).
// ---------------------------------------------------------------------------

export type LibretaFaceData = {
  identity: {
    name: string;
    species: string;
    breed: string | null;
    sex: string;
    microchipId: string | null;
    tattooCode: string | null;
    tattooLocation: string | null;
    publicToken: string;
  };
  /** Ascending by dueAt — reminders, appointments, and pending medication doses merged. */
  future: FutureLedgerItem[];
  /**
   * Descending by occurredAt — carries provenance + amendedAt (H3/WS-3).
   * Bounded to PAST_EVENTS_WINDOW most-recent events (perf/scale review
   * 2026-07-04 — unbounded libreta event loads); see `pastTruncated`.
   */
  past: HistorialEventRow[];
  /** True when `past` was cut off by PAST_EVENTS_WINDOW — older events exist. */
  pastTruncated: boolean;
  summary: VaccinationSummary;
  weightSamples: Array<{ date: Date; kg: number }>;
  activeShares: LibretaShareToken[];
  accessPath: "owner" | "org";
};
