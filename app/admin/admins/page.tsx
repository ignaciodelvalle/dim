import Link from "next/link";

import { eq } from "drizzle-orm";

import { OpCard, OpCardBody, OpPill } from "@/components/ui/dashboard";
import { db, profiles } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";

// Scaling note: auth.admin.listUsers() perPage=200. At 200+ admins this
// needs pagination or a different strategy. See ADR-8.

export default async function AdminsPage() {
  const { user } = await requireAdminOrRedirect();

  const supabase = createAdminClient();

  const adminRows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      deactivatedAt: profiles.deactivatedAt,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.role, "admin"));

  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const emailMap = new Map(authUsers?.users.map((u) => [u.id, u.email ?? ""]) ?? []);

  const admins = adminRows.map((a) => ({
    ...a,
    email: emailMap.get(a.id) ?? "",
    isSelf: a.id === user.id,
  }));

  const activeAdmins = admins.filter((a) => a.deactivatedAt === null);
  const deactivatedAdmins = admins.filter((a) => a.deactivatedAt !== null);

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-[20px] font-semibold tracking-tight text-ln-op-ink">
              Administradores
            </h1>
            <p className="text-[12px] text-ln-op-ink-2">
              Operadores institucionales con acceso de administrador.
            </p>
          </div>
          <Link
            href="/admin/admins/new"
            className="px-4 py-2 text-[12px] font-semibold bg-ln-op-azul text-white rounded-[6px] hover:bg-ln-op-azul-700 shrink-0"
          >
            + Crear admin
          </Link>
        </header>

        {activeAdmins.length === 0 ? (
          <div className="text-center py-12 rounded-[6px] border border-dashed border-ln-op-line">
            <p className="text-[12px] text-ln-op-mute">No hay administradores activos.</p>
            <p className="text-[12px] text-ln-op-mute mt-1">
              Para el bootstrap inicial, usa Supabase Studio para asignar el primer admin
              manualmente.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {activeAdmins.map((a) => (
              <AdminRow key={a.id} admin={a} />
            ))}
          </ul>
        )}

        {deactivatedAdmins.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-[12px] text-ln-op-mute hover:text-ln-op-ink-2 select-none">
              Desactivados ({deactivatedAdmins.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {deactivatedAdmins.map((a) => (
                <AdminRow key={a.id} admin={a} />
              ))}
            </ul>
          </details>
        )}

        <p className="text-[12px] text-ln-op-mute">
          <Link href="/admin" className="underline underline-offset-4 hover:text-ln-op-ink-2">
            {"<-"} Volver al dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}

type AdminRowProps = {
  admin: {
    id: string;
    displayName: string;
    email: string;
    isSelf: boolean;
    deactivatedAt: Date | null;
  };
};

function AdminRow({ admin }: AdminRowProps) {
  const isActive = admin.deactivatedAt === null;

  return (
    <li>
      <OpCard>
        <OpCardBody className="flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-0.5 flex items-center gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/admins/${admin.id}`}
                  className="text-[13px] font-semibold text-ln-op-azul hover:underline underline-offset-4"
                >
                  {admin.displayName}
                </Link>
                {admin.isSelf && <OpPill tone="open">Vos</OpPill>}
              </div>
              <p className="text-[12px] text-ln-op-mute">{admin.email}</p>
            </div>
          </div>

          <OpPill tone={isActive ? "ok" : "neutral"}>{isActive ? "Activo" : "Desactivado"}</OpPill>
        </OpCardBody>
      </OpCard>
    </li>
  );
}
