import { eq } from "drizzle-orm";

import { db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

import { EditProfileForm } from "./EditProfileForm";

export default async function EditarCuentaPage() {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db
    .select({
      displayName: profiles.displayName,
      phone: profiles.phone,
      avatarUrl: profiles.avatarUrl,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Editar mi información
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Actualizá tu nombre, teléfono y foto de perfil.
          </p>
        </header>

        <EditProfileForm
          initialProfile={{
            displayName: profile?.displayName ?? "",
            phone: profile?.phone ?? "",
            avatarUrl: profile?.avatarUrl ?? "",
          }}
        />
      </div>
    </main>
  );
}
