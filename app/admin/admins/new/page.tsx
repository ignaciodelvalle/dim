import { requireAdminOrRedirect } from "@/lib/auth-guards";

import { CreateAdminForm } from "./CreateAdminForm";

export default async function NewAdminPage() {
  await requireAdminOrRedirect();

  return (
    <main className="px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Crear cuenta administrador
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            El administrador tendra acceso universal. Se le enviara un magic link de acceso.
          </p>
        </header>

        <CreateAdminForm />
      </div>
    </main>
  );
}
