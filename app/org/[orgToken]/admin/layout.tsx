// Admin sub-route under /org/[orgToken]. Gates on the `capability.grant`
// capability (admins hold it implicitly; others only after explicit grant).
// Any page under /org/[orgToken]/admin can assume the visitor can decide
// capability requests.

import { requireOrgAccessByToken } from "@/lib/infra/auth-guards";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
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
      <main className="min-h-screen bg-ln-op-page flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
            Acceso restringido
          </h1>
          <p className="text-[13px] text-ln-op-mute">
            Esta sección es para administradores. Necesitás el permiso{" "}
            <code className="text-[11px] font-bold text-ln-op-ink-2 bg-ln-op-stripe px-1 rounded">
              capability.grant
            </code>{" "}
            para revisar solicitudes.
          </p>
          <Link
            href={`/org/${orgToken}`}
            className="inline-block px-4 py-2 rounded-[var(--radius-md)] bg-ln-op-azul text-white text-[13px] font-medium no-underline"
          >
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
