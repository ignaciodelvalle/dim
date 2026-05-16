// Intake page — capability-gated entry point for the refugio portal's
// "registrar ingreso" flow. The action that backs the form (createIntakeAction)
// re-checks `intake.create` defensively so this page is best-effort UX, not
// the security boundary.

import { getActiveMemberships, getGrantedCapabilities } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { IntakeForm } from "./IntakeForm";

export default async function IntakePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const memberships = await getActiveMemberships(user.id);
  const active = memberships[memberships.length - 1];
  if (!active) return null;

  const granted = await getGrantedCapabilities(active.membership);
  if (!granted.has("intake.create")) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Para registrar ingresos necesitás el permiso{" "}
            <code className="text-xs">intake.create</code>. Pedíselo a un administrador desde el
            panel.
          </p>
          <Link
            href="/refugio"
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {active.organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Registrar ingreso</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Cargá los datos básicos del animal y el motivo de ingreso. La organización queda como
            custodia temporal hasta que se asigne tránsito o se concrete una adopción.
          </p>
        </header>

        <IntakeForm />

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href="/refugio"
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            ← Volver al panel
          </Link>
        </footer>
      </div>
    </main>
  );
}
