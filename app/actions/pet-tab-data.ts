"use server";

// pet-tab-data.ts — thin shim (strangler migration 25/61). Business logic
// lives in src/modules/pets/application/tab-data/; this file adds the auth
// guard (requirePetAccess owner or org) and re-exports types.
// CRITICAL: every runtime export here must be async; types use `export type`.

import { requirePetAccess } from "@/lib/infra/pet-access";
import { fetchLatestAmendmentsForEvents } from "@/src/modules/events/application/amendment/fetch-latest-amendments";
import { getHistorialTabData as _getHistorialTabData } from "@/src/modules/pets/application/tab-data/get-historial-tab-data";
import { getLibretaFaceData as _getLibretaFaceData } from "@/src/modules/pets/application/tab-data/get-libreta-face-data";
import { getLibretaTabData as _getLibretaTabData } from "@/src/modules/pets/application/tab-data/get-libreta-tab-data";
import { getVacunasTabData as _getVacunasTabData } from "@/src/modules/pets/application/tab-data/get-vacunas-tab-data";
import type {
  HistorialTabData,
  LibretaFaceData,
  LibretaTabData,
  VacunasTabData,
} from "@/src/modules/pets/application/tab-data/types";

export type {
  HistorialEventRow,
  HistorialTabData,
  LibretaEventRow,
  LibretaFaceData,
  LibretaTabData,
  VacunasTabData,
} from "@/src/modules/pets/application/tab-data/types";

// WS-3 amendment enrichment ("Corregido · ver original") stays in the shim so
// the pets module doesn't take a new dependency on events (see
// scripts/check-dependency-direction.ts). Shared by the two functions below.
async function enrichWithAmendments<T extends { id: string }>(
  petId: string,
  rows: T[],
): Promise<(T & { amendedAt: Date | null })[]> {
  const eventIds = rows.map((r) => r.id);
  const amendments =
    eventIds.length > 0 ? await fetchLatestAmendmentsForEvents(petId, eventIds) : new Map();
  return rows.map((r) => ({ ...r, amendedAt: amendments.get(r.id)?.occurredAt ?? null }));
}

// Libreta panel (owner-only — matches old /libreta route).
export async function getLibretaTabData(
  publicToken: string,
): Promise<{ ok: true; data: LibretaTabData } | { ok: false; error: string }> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { ok: false, error: "Acceso denegado" };
  if (access.accessPath !== "owner") return { ok: false, error: "Acceso denegado" };
  const { user, pet, accessPath, organization } = access;
  return _getLibretaTabData({ user, pet, accessPath, organization });
}

// Vacunas panel.
export async function getVacunasTabData(
  publicToken: string,
): Promise<{ ok: true; data: VacunasTabData } | { ok: false; error: string }> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { ok: false, error: "Acceso denegado" };
  const { user, pet, accessPath, organization } = access;
  return _getVacunasTabData({ user, pet, accessPath, organization });
}

// Libreta face (Face 2, two-face redesign 2026-07-01). Unlike getLibretaTabData,
// this guard allows accessPath === "org" too — org viewers get a lens-clamped
// read-only face (design ADR-6); activeShares stays owner-gated in the use-case.
export async function getLibretaFaceData(
  publicToken: string,
): Promise<{ ok: true; data: LibretaFaceData } | { ok: false; error: string }> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { ok: false, error: "Acceso denegado" };
  const { user, pet, accessPath, organization } = access;
  const result = await _getLibretaFaceData({ user, pet, accessPath, organization });
  if (!result.ok) return result;
  return {
    ok: true,
    data: { ...result.data, past: await enrichWithAmendments(pet.id, result.data.past) },
  };
}

// Historial panel (owner-only — matches old /historial route).
export async function getHistorialTabData(
  publicToken: string,
): Promise<{ ok: true; data: HistorialTabData } | { ok: false; error: string }> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { ok: false, error: "Acceso denegado" };
  if (access.accessPath !== "owner") return { ok: false, error: "Acceso denegado" };
  const result = await _getHistorialTabData(access.pet);
  if (!result.ok) return result;
  return {
    ok: true,
    data: { ...result.data, events: await enrichWithAmendments(access.pet.id, result.data.events) },
  };
}
