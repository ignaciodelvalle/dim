// Nueva mascota — onboarding wizard (Item 13, 2026-06-18).
//
// Entry point from /mis-mascotas empty-state or post-signup.
// Wrapped in LnWizardShell to signal guided onboarding context.
// On success → /mis-mascotas/nueva/[token]/credencial (aha moment).
//
// UX 3.5 item 1: first-pet framing ("Registrar tu primera mascota" / wizard
// step label) is gated on the owner having zero pets. Owners who already have
// ≥1 pet receive neutral copy ("Registrar mascota").

import { and, count, eq, isNull } from "drizzle-orm";

import { LnWizardShell } from "@/components/ui/WizardShell";
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

  return (
    <LnWizardShell
      currentStep={1}
      totalSteps={1}
      stepLabels={[isFirstPet ? "Registrar tu primera mascota" : "Registrar mascota"]}
      mainId="main-content"
    >
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Registrar mascota
        </h1>
        <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
          Empezamos con lo mínimo. Vas a poder completar el resto en su perfil.
        </p>
      </div>

      <MinimalNewPetForm action={createPetAction} />
    </LnWizardShell>
  );
}
