"use server";

// pet-tab-data.ts — thin shim (strangler migration 25/61).
//
// Business logic moved to:
//   src/modules/pets/application/tab-data/
//
// This file re-exports all exported types and provides thin loader wrappers
// that add the auth guard (requirePetAccess owner or org).
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { requirePetAccess } from "@/lib/infra/pet-access";
import { fetchLatestAmendmentsForEvents } from "@/src/modules/events/application/amendment/fetch-latest-amendments";
import { getHistorialTabData as _getHistorialTabData } from "@/src/modules/pets/application/tab-data/get-historial-tab-data";
import { getLibretaTabData as _getLibretaTabData } from "@/src/modules/pets/application/tab-data/get-libreta-tab-data";
import { getVacunasTabData as _getVacunasTabData } from "@/src/modules/pets/application/tab-data/get-vacunas-tab-data";
import type {
  HistorialTabData,
  LibretaTabData,
  VacunasTabData,
} from "@/src/modules/pets/application/tab-data/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  HistorialEventRow,
  HistorialTabData,
  LibretaEventRow,
  LibretaTabData,
  VacunasTabData,
} from "@/src/modules/pets/application/tab-data/types";

// ---------------------------------------------------------------------------
// Libreta panel
// ---------------------------------------------------------------------------

export async function getLibretaTabData(
  publicToken: string,
): Promise<{ ok: true; data: LibretaTabData } | { ok: false; error: string }> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { ok: false, error: "Acceso denegado" };
  // Libreta is owner-only — matches old /libreta route (requireOwnedPetByToken).
  if (access.accessPath !== "owner") return { ok: false, error: "Acceso denegado" };
  const { user, pet, accessPath, organization } = access;
  return _getLibretaTabData({ user, pet, accessPath, organization });
}

// ---------------------------------------------------------------------------
// Vacunas panel
// ---------------------------------------------------------------------------

export async function getVacunasTabData(
  publicToken: string,
): Promise<{ ok: true; data: VacunasTabData } | { ok: false; error: string }> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { ok: false, error: "Acceso denegado" };
  const { user, pet, accessPath, organization } = access;
  return _getVacunasTabData({ user, pet, accessPath, organization });
}

// ---------------------------------------------------------------------------
// Historial panel
// ---------------------------------------------------------------------------

export async function getHistorialTabData(
  publicToken: string,
): Promise<{ ok: true; data: HistorialTabData } | { ok: false; error: string }> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { ok: false, error: "Acceso denegado" };
  // Historial is owner-only — matches old /historial route (requireOwnedPetByToken).
  if (access.accessPath !== "owner") return { ok: false, error: "Acceso denegado" };
  const result = await _getHistorialTabData(access.pet);
  if (!result.ok) return result;

  // WS-3: enrich each row with amendedAt so the timeline can show
  // "Corregido · ver original". Kept in the shim (app layer) so the pets
  // module does not take a new dependency on the events module.
  const eventIds = result.data.events.map((e) => e.id);
  const amendments =
    eventIds.length > 0 ? await fetchLatestAmendmentsForEvents(access.pet.id, eventIds) : new Map();
  return {
    ok: true,
    data: {
      ...result.data,
      events: result.data.events.map((e) => ({
        ...e,
        amendedAt: amendments.get(e.id)?.occurredAt ?? null,
      })),
    },
  };
}
