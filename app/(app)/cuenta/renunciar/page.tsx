import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

import { VetSelfResignForm } from "./VetSelfResignForm";

// Server component gate: only active personal vet accounts reach the form.
// All others are redirected to /cuenta.

export default async function RenunciarPage() {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db
    .select({ role: profiles.role, accountType: profiles.accountType, displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!profile || profile.role !== "vet" || profile.accountType !== "personal") {
    redirect("/cuenta");
  }

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Renunciar a rol veterinario/a
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Hola, <strong>{profile.displayName}</strong>. Esta accion es irreversible desde este
            panel — para volver a tener el rol vet vas a tener que solicitarlo de nuevo.
          </p>
        </header>

        <VetSelfResignForm />
      </div>
    </main>
  );
}
