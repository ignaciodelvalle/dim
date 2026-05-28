// Admin sub-route under /org/[orgToken]. Gates on the `capability.grant`
// capability (admins hold it implicitly; others only after explicit grant).
// Any page under /org/[orgToken]/admin can assume the visitor can decide
// capability requests.

import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";
import Link from "next/link";

export default async function OrgAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("capability.grant")) {
    return (
      <main className="min-h-screen p-6 bg-white  flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Acceso restringido</h1>
          <p className="text-gob-text-gray ">
            Esta sección es para administradores. Necesitás el permiso{" "}
            <code className="text-xs">capability.grant</code> para revisar solicitudes.
          </p>
          <Link
            href={`/org/${orgToken}`}
            className="inline-block px-4 py-2 rounded bg-gob-primary text-white  "
          >
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
