import { createPetAction } from "@/app/actions/pets";
import { PetForm } from "@/components/PetForm";

export default function NewPetPage() {
  // Auth is enforced by the (app) layout above us — no need to re-check here.
  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Nueva mascota
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Esta es la primera entrada en la libreta digital de tu mascota.
          </p>
        </div>
        <PetForm action={createPetAction} />
      </div>
    </main>
  );
}
