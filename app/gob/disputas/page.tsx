import Link from "next/link";
import { Suspense } from "react";

import { type UrlTabItem, UrlTabs, UrlTabsContent } from "@/components/ui/UrlTabs";
import { OpCard, OpCardBody } from "@/components/ui/dashboard";
import { custodyDisputes, db, pets } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { desc, eq, ne } from "drizzle-orm";

const TABS: UrlTabItem[] = [
  { value: "open", label: "Abiertas" },
  { value: "resolved", label: "Resueltas" },
];

function parseTab(raw: string | undefined): "open" | "resolved" {
  return raw === "resolved" ? "resolved" : "open";
}

export default async function GobDisputasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const sp = await searchParams;
  const activeTab = parseTab(sp.tab);

  // Fetch both statuses in one query; client-filter by jurisdiction below.
  // "resolved" bucket includes both resolved + withdrawn rows.
  const statusFilter =
    activeTab === "open" ? eq(custodyDisputes.status, "open") : ne(custodyDisputes.status, "open");

  const rows = await db
    .select({ dispute: custodyDisputes, pet: pets })
    .from(custodyDisputes)
    .innerJoin(pets, eq(pets.id, custodyDisputes.petId))
    .where(statusFilter)
    .orderBy(desc(custodyDisputes.createdAt));

  // Admin sees all; govt is filtered to their jurisdiction tuples.
  const scoped =
    profile.role === "admin"
      ? rows
      : rows.filter((row) =>
          jurisdictions.some(
            (j) =>
              j.province === row.dispute.jurisdictionProvince &&
              j.locality === row.dispute.jurisdictionLocality,
          ),
        );

  const STATUS_LABELS: Record<string, string> = {
    open: "Abierta",
    resolved: "Resuelta",
    withdrawn: "Retirada",
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Disputas
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Disputas de custodia</h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Todas las disputas en el sistema."
            : "Disputas en tu cobertura."}
        </p>
      </header>

      <Suspense>
        <UrlTabs paramKey="tab" defaultValue="open" tabs={TABS} aria-label="Filtrar disputas">
          <UrlTabsContent value={activeTab}>
            {scoped.length === 0 ? (
              <p className="text-[13px] text-ln-op-mute pt-2">
                {activeTab === "open"
                  ? "No hay disputas abiertas."
                  : "No hay disputas resueltas o retiradas."}
              </p>
            ) : (
              <ul className="space-y-2 pt-2">
                {scoped.map(({ dispute, pet }) => (
                  <li key={dispute.id}>
                    <OpCard>
                      <OpCardBody className="p-0">
                        <Link
                          href={`/gob/disputas/${dispute.publicToken}`}
                          className="block px-4 py-3 hover:bg-ln-op-stripe transition-colors no-underline"
                        >
                          <p className="text-[13px] font-medium text-ln-op-ink">
                            {pet.name}{" "}
                            <span className="text-ln-op-mute font-normal">({pet.species})</span>
                          </p>
                          <p className="text-[12px] text-ln-op-mute mt-0.5">
                            {dispute.jurisdictionLocality}, {dispute.jurisdictionProvince} ·{" "}
                            {STATUS_LABELS[dispute.status] ?? dispute.status}{" "}
                            {new Date(dispute.createdAt).toLocaleDateString("es-AR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                          <p className="text-[10px] text-ln-op-faint font-mono mt-1">
                            {dispute.publicToken}
                          </p>
                        </Link>
                      </OpCardBody>
                    </OpCard>
                  </li>
                ))}
              </ul>
            )}
          </UrlTabsContent>
        </UrlTabs>
      </Suspense>
    </div>
  );
}

export const dynamic = "force-dynamic";
