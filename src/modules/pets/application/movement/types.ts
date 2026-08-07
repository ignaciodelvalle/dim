// Movement use-case types (movilidad-jurisdiccional Fase 1).

import type { Pet } from "@/db";
import type { PetEventAuthorship } from "@/lib/infra/pet-access";
import type { CorridorId } from "@/lib/reference/cross-border-corridors";

// Input payloads mirror the movement_recorded Zod union in
// lib/events/event-schemas.ts (snake_case, payload_version filled on parse).
// The writer re-validates through validateEventPayload — these types exist
// for compile-time narrowing at call sites, not as the source of truth.

export type JurisdictionChangedMovement = {
  sub_kind: "jurisdiction_changed";
  from_country: string;
  from_province: string | null;
  from_locality: string | null;
  to_country: string;
  to_province: string | null;
  to_locality: string | null;
  effective_date: string;
  reason: string | null;
};

export type CviIssuedMovement = {
  sub_kind: "cvi_issued";
  origin_country: string;
  cvi_number: string;
  issuing_authority: string;
  issued_date: string;
  chip_iso_country_code: string | null;
};

export type TransportRecordedMovement = {
  sub_kind: "transport_recorded";
  corridor_id: CorridorId;
  direction: "outbound_from_ar";
  travel_date: string;
  mode: "air" | "land" | "sea" | null;
  purpose: string | null;
};

export type MovementInput =
  | JurisdictionChangedMovement
  | CviIssuedMovement
  | TransportRecordedMovement;

export type RecordMovementParams = {
  pet: Pick<Pet, "id" | "publicToken">;
  recordedByUserId: string;
  eventAuthorship: PetEventAuthorship;
  occurredAt: Date;
  movement: MovementInput;
  notes: string | null;
  now?: Date;
};

export type RecordMovementResult = { ok: true; eventId: string } | { ok: false; error: string };
