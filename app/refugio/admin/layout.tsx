// Admin sub-route under /refugio. Gates on the `capability.grant` capability
// (admins hold it implicitly; others only after explicit grant). Any page
// under /refugio/admin should be safe to assume the visitor can decide
// capability requests.

import { getActiveMemberships, getGrantedCapabilities } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function RefugioAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The parent /refugio layout already redirected unauthenticated users.
  if (!user) return null;

  const memberships = await getActiveMemberships(user.id);
  const active = memberships[memberships.length - 1];
  if (!active) return null;

  const granted = await getGrantedCapabilities(active.membership);
  if (!granted.has("capability.grant")) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Acceso restringido</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Esta sección es para administradores. Necesitás el permiso{" "}
            <code className="text-xs">capability.grant</code> para revisar solicitudes.
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

  return <>{children}</>;
}
