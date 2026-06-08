import { PetForm } from "@/components/PetForm";
import { createPetAction } from "@/src/modules/pets/actions";
import Link from "next/link";

export default function NewPetPage() {
  // Auth is enforced by the (app) layout above us — no need to re-check here.
  return (
    <div className="min-h-screen p-6 bg-white">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text mb-4"
        >
          ← Volver a mis mascotas
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">Nueva mascota</h1>
          <p className="text-sm text-gob-text-gray ">
            Esta es la primera entrada en la libreta digital de tu mascota.
          </p>
        </div>
        <PetForm action={createPetAction} />
      </div>
    </div>
  );
}
