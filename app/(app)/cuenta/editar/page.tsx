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
      preferredVetName: profiles.preferredVetName,
      preferredVetPhone: profiles.preferredVetPhone,
      emergencyContactName: profiles.emergencyContactName,
      emergencyContactPhone: profiles.emergencyContactPhone,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Editar mi información
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Actualizá tu nombre, teléfono, contactos de emergencia y foto de perfil.
          </p>
        </header>

        <EditProfileForm
          initialProfile={{
            displayName: profile?.displayName ?? "",
            phone: profile?.phone ?? "",
            avatarUrl: profile?.avatarUrl ?? "",
            preferredVetName: profile?.preferredVetName ?? "",
            preferredVetPhone: profile?.preferredVetPhone ?? "",
            emergencyContactName: profile?.emergencyContactName ?? "",
            emergencyContactPhone: profile?.emergencyContactPhone ?? "",
          }}
        />
      </div>
    </main>
  );
}
