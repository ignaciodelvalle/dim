// Use-case types for pet tab-data loaders (strangler migration 25/61).

import type { LibretaShareToken } from "@/db";
import type {
  fetchActiveRemindersForPet,
  fetchVaccinationHistory,
} from "@/lib/analytics/owner-dashboard";
import type { LibretaHealthStatus, VaccinationSummary } from "@/lib/libreta-health-status";
import type { LibretaGroupKey } from "@/lib/libreta-sanitaria";

// ---------------------------------------------------------------------------
// Libreta panel
// ---------------------------------------------------------------------------

// Row type for grouped libreta events (full petEvent row shape).
export type LibretaEventRow = {
  id: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date;
  notes: string | null;
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
  tipoEventoCode?: string | null;
};

export type LibretaTabData = {
  pet: {
    name: string;
    species: string;
    breed: string | null;
    sex: string;
    microchipId: string | null;
    tattooCode: string | null;
    tattooLocation: string | null;
    publicToken: string;
  };
  photoUrl: string | null;
  ownerFirstName: string | null;
  groupedEvents: Record<LibretaGroupKey, LibretaEventRow[]>;
  activeShares: LibretaShareToken[];
  accessPath: "owner" | "org";
  organizationDisplayName: string | null;
  /** Precomputed health-status snapshot for the "Estado médico actual" dashboard. */
  healthStatus: LibretaHealthStatus;
  /** Count of active reminders for the Pendientes card. */
  activeRemindersCount: number;
};

// ---------------------------------------------------------------------------
// Vacunas panel
// ---------------------------------------------------------------------------

export type VacunasTabData = {
  petName: string;
  petToken: string;
  petSpecies: string;
  upcomingReminders: Awaited<ReturnType<typeof fetchActiveRemindersForPet>>;
  history: Awaited<ReturnType<typeof fetchVaccinationHistory>>;
  /** Precomputed vaccination summary for the Estado de vacunación badge block. */
  vaccinationSummary: VaccinationSummary;
  accessPath: "owner" | "org";
  organizationDisplayName: string | null;
};

// ---------------------------------------------------------------------------
// Historial panel
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
  attachmentUrl: string | null;
  // Set when a later `event_amended` event corrects this one — drives the
  // "Corregido · ver original" affordance (WS-3). Enriched in the tab-data shim.
  amendedAt?: Date | null;
};

export type HistorialTabData = {
  petName: string;
  petToken: string;
  events: HistorialEventRow[];
};
