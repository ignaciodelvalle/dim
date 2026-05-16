// Refugio portal — auth + active-membership gate. Any page under `/refugio`
// requires the user to be logged in AND to have at least one active
// organization_membership row (left_at IS NULL).
//
// The portal is org-type-agnostic by schema; the v1 surface targets shelter
// orgs ("refugios"). Clinic / sanitary-authority surfaces will share the same
// gate when they land.

import { getActiveMemberships } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function RefugioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const memberships = await getActiveMemberships(user.id);
  if (memberships.length === 0) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Acceso restringido</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Este panel es para personal de organizaciones (refugios, clínicas, rescatistas). No
            encontramos ninguna organización activa asociada a tu cuenta.
          </p>
          <p className="text-sm text-neutral-500">
            Si pertenecés a una organización, pedile a un administrador que te sume.
          </p>
          <Link
            href="/mis-mascotas"
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            Volver a mis mascotas
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
