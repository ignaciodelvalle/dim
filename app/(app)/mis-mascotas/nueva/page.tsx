// Nueva mascota — onboarding alta (Item 13, 2026-06-18).
//
// Entry point from /mis-mascotas empty-state or post-signup.
// On success → /mis-mascotas/nueva/[token]/credencial (aha moment).
//
// PO decision 2026-07-08: the alta is a 2-step wizard (identidad → foto y más).
// The wizard chrome + step state live in the client MinimalNewPetForm; this
// server component only resolves the auth + first-pet framing.
//
// UX 3.5 item 1: first-pet framing ("Registrar tu primera mascota") is gated on
// the owner having zero pets. Owners who already have ≥1 pet receive neutral
// copy ("Registrar mascota").

import { and, count, eq, isNull } from "drizzle-orm";

import { db, ownerships } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { createPetAction } from "@/src/modules/pets/actions";
import { MinimalNewPetForm } from "./MinimalNewPetForm";

export default async function NewPetPage() {
  // Auth is enforced by the (app) layout above us, but we need the user id to
  // count their existing pets — a single SQL COUNT, never loads pet rows.
  const { user } = await requireUserOrRedirect();

  const [{ petCount }] = await db
    .select({ petCount: count() })
    .from(ownerships)
    .where(and(eq(ownerships.ownerUserId, user.id), isNull(ownerships.endedAt)));

  const isFirstPet = petCount === 0;

  // The wizard chrome (step counter, progress bar, back navigation) and the
  // heading now live inside the client form, which owns the paso-1/paso-2 step
  // state. See MinimalNewPetForm.
  return <MinimalNewPetForm action={createPetAction} isFirstPet={isFirstPet} />;
}
