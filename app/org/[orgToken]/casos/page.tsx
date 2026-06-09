// Org-scope case index. Lists every case where the org is the opener
// OR holds an active ownership row on the subject pet.
//
// Each row links to /casos/[publicCode]. The "Ver mascota" link is
// independent of the row link — separate tap target per Fase E spec.

// ---------------------------------------------------------------------------
// WIRED (sprint 5 PR-047 — 2026-05-27)
//
// Reachable from the org dashboard "Casos abiertos" count card. The previous
// DEFERRED-BY-DESIGN audit comment is retired; nav presets remain a future
// improvement (the link from the dashboard is the canonical entry today).
// ---------------------------------------------------------------------------

import Link from "next/link";

import { CaseBadge } from "@/components/CaseBadge";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { listCasesForOrg } from "@/lib/case-queries";
import { formatDate } from "@/lib/format";

interface PageProps {
  params: Promise<{ orgToken: string }>;
}

export default async function OrgCasosPage({ params }: PageProps) {
  const { orgToken } = await params;
  const { organization } = await requireOrgAccessByToken(orgToken);
  const items = await listCasesForOrg(organization.id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Casos</h1>
        <p className="text-[13px] text-ln-op-mute">
          Expedientes donde {organization.displayName} es la organización que abrió el caso o
          actualmente tiene custodia activa.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-[6px] border border-dashed border-ln-op-line p-8 text-center text-[13px] text-ln-op-mute">
          Sin casos abiertos ni cerrados por ahora.
        </p>
      ) : (
        <OpCard>
          <OpCardHead
            title="Expedientes"
            actions={`${items.length} caso${items.length !== 1 ? "s" : ""}`}
          />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line">
              {items.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <CaseBadge
                      publicCode={c.publicCode}
                      caseKind={c.caseKind}
                      status={c.status}
                      size="sm"
                    />
                    <span className="text-[12px] text-ln-op-mute">
                      Abierto el {formatDate(c.openedAt)}
                      {c.closedAt ? ` · Cerrado el ${formatDate(c.closedAt)}` : ""}
                    </span>
                  </div>
                  {c.primaryPetPublicToken && c.primaryPetName ? (
                    <Link
                      href={`/org/${orgToken}/mascotas/${c.primaryPetPublicToken}`}
                      className="inline-flex items-center rounded-full bg-ln-op-stripe px-3 py-1.5 text-[12px] text-ln-op-ink transition hover:bg-ln-op-line no-underline"
                    >
                      🐾 {c.primaryPetName}
                    </Link>
                  ) : (
                    <span className="text-[12px] text-ln-op-mute">Caso sin mascota registrada</span>
                  )}
                </li>
              ))}
            </ul>
          </OpCardBody>
        </OpCard>
      )}
    </div>
  );
}
