import { requireAdminOrRedirect } from "@/lib/auth-guards";

import { CreateGovtForm } from "./CreateGovtForm";

export default async function NewGovtPage() {
  await requireAdminOrRedirect();

  return (
    <main className="px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
            Crear cuenta gobierno
          </h1>
          <p className="text-sm text-gob-text-gray mt-1">
            El operador recibira un magic link de acceso unico.
          </p>
        </header>

        <CreateGovtForm />
      </div>
    </main>
  );
}
