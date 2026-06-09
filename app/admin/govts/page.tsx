import Link from "next/link";

import { count, eq, isNull } from "drizzle-orm";

import { OpCard, OpCardBody, OpPill } from "@/components/ui/dashboard";
import { db, govtAssignments, profiles } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";

// Scaling note: auth.admin.listUsers() called once with perPage=200 and
// email fetched in-memory per row. Safe for v1 volume (<100 govts).
// At 200+ institutional operators this query should be replaced with a
// server-side join strategy. See ADR-8.

export default async function GovtsPage() {
  await requireAdminOrRedirect();

  const supabase = createAdminClient();

  // Fetch all institutional govt profiles
  const govtRows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.role, "govt"));

  // Fetch active locality counts per govt
  const localityCounts = await db
    .select({
      userId: govtAssignments.userId,
      activeCount: count(govtAssignments.id),
    })
    .from(govtAssignments)
    .where(isNull(govtAssignments.revokedAt))
    .groupBy(govtAssignments.userId);

  const localityCountMap = new Map(localityCounts.map((r) => [r.userId, Number(r.activeCount)]));

  // Fetch emails from auth.users via service-role client (no email column on profiles)
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const emailMap = new Map(authUsers?.users.map((u) => [u.id, u.email ?? ""]) ?? []);

  const govts = govtRows.map((g) => ({
    ...g,
    email: emailMap.get(g.id) ?? "",
    activeLocalityCount: localityCountMap.get(g.id) ?? 0,
  }));

  const activeGovts = govts.filter((g) => g.deactivatedAt === null);
  const deactivatedGovts = govts.filter((g) => g.deactivatedAt !== null);

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-[20px] font-semibold tracking-tight text-ln-op-ink">Gobiernos</h1>
            <p className="text-[12px] text-ln-op-ink-2">
              Operadores institucionales con rol de gobierno.
            </p>
          </div>
          <Link
            href="/admin/govts/new"
            className="px-4 py-2 text-[12px] font-semibold bg-ln-op-azul text-white rounded-[6px] hover:bg-ln-op-azul-700 shrink-0"
          >
            + Crear govt
          </Link>
        </header>

        {activeGovts.length === 0 ? (
          <div className="text-center py-12 rounded-[6px] border border-dashed border-ln-op-line">
            <p className="text-[12px] text-ln-op-mute">Aun no hay govts activos.</p>
            <Link
              href="/admin/govts/new"
              className="mt-3 inline-block text-[12px] underline underline-offset-4 text-ln-op-azul hover:text-ln-op-azul-700"
            >
              Crear el primer govt
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {activeGovts.map((g) => (
              <GovtRow key={g.id} govt={g} />
            ))}
          </ul>
        )}

        {deactivatedGovts.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-[12px] text-ln-op-mute hover:text-ln-op-ink-2 select-none">
              Desactivados ({deactivatedGovts.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {deactivatedGovts.map((g) => (
                <GovtRow key={g.id} govt={g} />
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

type GovtRowProps = {
  govt: {
    id: string;
    displayName: string;
    email: string;
    activeLocalityCount: number;
    deactivatedAt: Date | null;
  };
};

function GovtRow({ govt }: GovtRowProps) {
  const isActive = govt.deactivatedAt === null;

  return (
    <li>
      <OpCard>
        <OpCardBody className="flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            <Link
              href={`/admin/govts/${govt.id}`}
              className="text-[13px] font-semibold text-ln-op-azul hover:underline underline-offset-4"
            >
              {govt.displayName}
            </Link>
            <p className="text-[12px] text-ln-op-mute">{govt.email}</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[12px] text-ln-op-mute">
              {govt.activeLocalityCount} localidad{govt.activeLocalityCount !== 1 ? "es" : ""}
            </span>
            <OpPill tone={isActive ? "ok" : "neutral"}>
              {isActive ? "Activo" : "Desactivado"}
            </OpPill>
          </div>
        </OpCardBody>
      </OpCard>
    </li>
  );
}
