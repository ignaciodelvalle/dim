import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";

import { CreateGovtForm } from "./CreateGovtForm";

export default async function NewGovtPage() {
  await requireAdminOrRedirect();

  return (
    <main className="px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-ln-op-ink">
            Crear cuenta gobierno
          </h1>
          <p className="text-sm text-ln-op-ink-2 mt-1">
            El operador recibirá un magic link de acceso único.
          </p>
        </header>

        <CreateGovtForm />
      </div>
    </main>
  );
}
