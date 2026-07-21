import Link from "next/link";

import { eq } from "drizzle-orm";

import {
  OpCard,
  OpCardBody,
  OpFilterBar,
  OpPill,
  SearchFilterField,
} from "@/components/ui/dashboard";
import { db, profiles } from "@/db";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { buildAuthEmailMap, createAdminClient } from "@/lib/supabase/admin";
import { normalizeText } from "@/lib/utils/text-normalize";

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { user } = await requireAdminOrRedirect();
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();

  const supabase = createAdminClient();

  const adminRows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      deactivatedAt: profiles.deactivatedAt,
      createdAt: profiles.createdAt,
      isSystem: profiles.isSystem,
    })
    .from(profiles)
    .where(eq(profiles.role, "admin"));

  // C21: page through ALL auth users so emails are complete past 200 operators.
  const emailMap = await buildAuthEmailMap(supabase);

  const allAdmins = adminRows.map((a) => ({
    ...a,
    email: emailMap.get(a.id) ?? "",
    isSelf: a.id === user.id,
  }));

  // R4 (opfilterbar-sweep-2026-07-21): the roster had NO filter at all — a
  // scroll-and-scan-only list, unlike every other roster screen
  // (/admin/govts, /gob|/admin usuarios). Accent-insensitive substring match
  // on name or email, in JS (this roster is bounded institutional operators,
  // not a paginated dataset — same cost class as the existing partition
  // filters below, no new query needed).
  const normalizedQuery = normalizeText(query);
  const admins = normalizedQuery
    ? allAdmins.filter(
        (a) =>
          normalizeText(a.displayName).includes(normalizedQuery) ||
          normalizeText(a.email).includes(normalizedQuery),
      )
    : allAdmins;

  const activeAdmins = admins.filter((a) => a.deactivatedAt === null);
  const deactivatedAdmins = admins.filter((a) => a.deactivatedAt !== null);

  // C21/A7: keep service/system accounts out of the human admin list — they
  // aren't people and clutter the roster. Shown in a separate collapsed section
  // below. Partition by the DB flag (profiles.is_system), not a display-name
  // heuristic that broke once auth-user enumeration exceeded one page.
  const humanActive = activeAdmins.filter((a) => !a.isSystem);
  const systemActive = activeAdmins.filter((a) => a.isSystem);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-ln-op-ink">Administradores</h1>
          <p className="text-sm text-ln-op-ink-2">
            Operadores institucionales con acceso de administrador.
          </p>
        </div>
        <Link
          href="/admin/admins/new"
          className="px-4 py-2 text-sm font-semibold bg-ln-op-azul text-white rounded-[var(--radius-md)] hover:bg-ln-op-azul-700 shrink-0"
        >
          + Crear admin
        </Link>
      </header>

      {/* R4 fix — this roster had zero filters (PO: "admin no tiene ningún
          tipo de filtro posible"). Role is fixed (this list IS the admin
          role), so only a free-text search applies — no axis to register. */}
      <OpFilterBar showPeriod={false}>
        <SearchFilterField
          paramKey="q"
          value={query}
          label="Buscar"
          placeholder="Buscar por nombre o email"
        />
      </OpFilterBar>

      {humanActive.length === 0 ? (
        <div className="text-center py-12 rounded-[var(--radius-md)] border border-dashed border-ln-op-line">
          <p className="text-sm text-ln-op-mute">
            {normalizedQuery ? "Sin resultados." : "No hay administradores activos."}
          </p>
          {!normalizedQuery && (
            <p className="text-sm text-ln-op-mute mt-1">
              Para el bootstrap inicial, usa Supabase Studio para asignar el primer admin
              manualmente.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {humanActive.map((a) => (
            <AdminRow key={a.id} admin={a} />
          ))}
        </ul>
      )}

      {systemActive.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-ln-op-mute hover:text-ln-op-ink-2 select-none">
            Cuentas de sistema ({systemActive.length})
          </summary>
          <p className="mt-1 text-[11px] text-ln-op-mute">
            Cuentas de servicio (backfills, jobs) — no son personas.
          </p>
          <ul className="mt-2 space-y-2">
            {systemActive.map((a) => (
              <AdminRow key={a.id} admin={a} />
            ))}
          </ul>
        </details>
      )}

      {deactivatedAdmins.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-ln-op-mute hover:text-ln-op-ink-2 select-none">
            Desactivados ({deactivatedAdmins.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {deactivatedAdmins.map((a) => (
              <AdminRow key={a.id} admin={a} />
            ))}
          </ul>
        </details>
      )}

      <p className="text-sm text-ln-op-mute">
        <Link href="/admin" className="underline underline-offset-4 hover:text-ln-op-ink-2">
          {"←"} Volver al panel
        </Link>
      </p>
    </div>
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
              <p className="text-sm text-ln-op-mute">{admin.email}</p>
            </div>
          </div>

          <OpPill tone={isActive ? "ok" : "neutral"}>{isActive ? "Activo" : "Desactivado"}</OpPill>
        </OpCardBody>
      </OpCard>
    </li>
  );
}
