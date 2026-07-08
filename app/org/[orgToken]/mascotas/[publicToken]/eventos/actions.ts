"use server";

// Org pet ficha — clinical event recording wrappers (staging validation
// 2026-07-04, bug 2: members with event.write had NO surface on the held-pet
// ficha to record a vaccine/weight/note).
//
// These are THIN redirect adapters over the shared event actions in
// src/modules/events/actions.ts — they add NO auth of their own because the
// shared actions already resolve org-path access at the signing boundary:
// requireAlivePetAccess / requirePetAccess (lib/infra/pet-access.ts) accept an
// active org custody row and, for writes, enforce the `event.write` capability
// server-side (defense in depth behind the UI gate on the ficha). Provenance
// (#43) is stamped there too: matriculated signer → vet/verified, otherwise
// shelter/org_registered.
//
// The ONLY thing these wrappers change is the success redirect: the shared
// actions land on the OWNER cockpit (/mis-mascotas/...), which is the wrong
// home for an org operator — they return to the org ficha instead.

import type { EventFormState } from "@/src/modules/events/actions";
import {
  createNoteAction,
  createVaccinationAction,
  createWeightAction,
} from "@/src/modules/events/actions";

function orgFichaRedirect(orgToken: string, publicToken: string): string {
  return `/org/${orgToken}/mascotas/${publicToken}?registrado=1`;
}

function withOrgRedirect(
  result: EventFormState,
  orgToken: string,
  publicToken: string,
): EventFormState {
  if (result.ok) {
    return { ...result, redirectTo: orgFichaRedirect(orgToken, publicToken) };
  }
  return result;
}

export async function orgRecordVaccinationAction(
  orgToken: string,
  publicToken: string,
  previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const result = await createVaccinationAction(publicToken, previous, formData);
  return withOrgRedirect(result, orgToken, publicToken);
}

export async function orgRecordWeightAction(
  orgToken: string,
  publicToken: string,
  previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const result = await createWeightAction(publicToken, previous, formData);
  return withOrgRedirect(result, orgToken, publicToken);
}

export async function orgRecordNoteAction(
  orgToken: string,
  publicToken: string,
  previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const result = await createNoteAction(publicToken, previous, formData);
  return withOrgRedirect(result, orgToken, publicToken);
}
