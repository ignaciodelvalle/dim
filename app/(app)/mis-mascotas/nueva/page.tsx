// Nueva mascota — onboarding wizard (Item 13, 2026-06-18).
//
// Entry point from /mis-mascotas empty-state or post-signup.
// Wrapped in LnWizardShell to signal guided onboarding context.
// On success → /mis-mascotas/nueva/[token]/credencial (aha moment).

import { LnWizardShell } from "@/components/ui/WizardShell";
import { createPetAction } from "@/src/modules/pets/actions";
import { MinimalNewPetForm } from "./MinimalNewPetForm";

export default function NewPetPage() {
  // Auth is enforced by the (app) layout above us.
  return (
    <LnWizardShell
      currentStep={1}
      totalSteps={1}
      stepLabels={["Registrar tu primera mascota"]}
      mainId="main-content"
    >
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Registrar mascota
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Empezamos con lo mínimo. Vas a poder completar el resto en su perfil.
        </p>
      </div>

      <MinimalNewPetForm action={createPetAction} />
    </LnWizardShell>
  );
}
