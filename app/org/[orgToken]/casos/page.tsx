// Org-scope case index. Lists every case where the org is the opener
// OR holds an active ownership row on the subject pet.
//
// Each row links to /casos/[publicCode]. The "Ver mascota" link is
// independent of the row link — separate tap target per Fase E spec.

// ---------------------------------------------------------------------------
// DEFERRED BY DESIGN (audit-internal-roles-pages PR2/9 — 2026-05-26)
//
// This page exists but is NOT reachable from any nav or dashboard CTA. The
// underlying flow (cases view per org) is not yet wired end-to-end. Keep
// this page intact — when the flow lands, add a nav entry in
// `components/poncho/Layout/nav-presets.ts` or a CTA on the org dashboard.
//
// Wire when org dashboard CTA for open cases lands.
//
// Audited: 2026-05-26. Re-evaluate during next role audit.
// ---------------------------------------------------------------------------

import Link from "next/link";

import { CaseBadge } from "@/components/CaseBadge";
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
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gob-text">Casos</h1>
        <p className="mt-1 text-sm text-gob-text-gray">
          Expedientes donde {organization.displayName} es la organización que abrió el caso o
          actualmente tiene custodia activa.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gob-border-strong p-8 text-center text-sm text-gob-text-muted">
          Sin casos abiertos ni cerrados por ahora.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-2xl border border-gob-border bg-white p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-1">
                <CaseBadge
                  publicCode={c.publicCode}
                  caseKind={c.caseKind}
                  status={c.status}
                  size="sm"
                />
                <span className="text-xs text-gob-text-muted">
                  Abierto el {formatDate(c.openedAt)}
                  {c.closedAt ? ` · Cerrado el ${formatDate(c.closedAt)}` : ""}
                </span>
              </div>
              {c.primaryPetPublicToken && c.primaryPetName ? (
                <Link
                  href={`/org/${orgToken}/mascotas/${c.primaryPetPublicToken}`}
                  className="inline-flex items-center rounded-full bg-gob-surface-alt px-3 py-1.5 text-sm text-gob-text-gray transition hover:bg-gob-border"
                >
                  🐾 {c.primaryPetName}
                </Link>
              ) : (
                <span className="text-sm text-gob-text-muted">Caso sin mascota registrada</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
