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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Casos</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Expedientes donde {organization.displayName} es la organización que abrió el caso o
          actualmente tiene custodia activa.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Sin casos abiertos ni cerrados por ahora.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-1">
                <CaseBadge
                  publicCode={c.publicCode}
                  caseKind={c.caseKind}
                  status={c.status}
                  size="sm"
                />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Abierto el {formatDate(c.openedAt)}
                  {c.closedAt ? ` · Cerrado el ${formatDate(c.closedAt)}` : ""}
                </span>
              </div>
              {c.primaryPetPublicToken && c.primaryPetName ? (
                <Link
                  href={`/org/${orgToken}/mascotas/${c.primaryPetPublicToken}`}
                  className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  🐾 {c.primaryPetName}
                </Link>
              ) : (
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Caso sin mascota registrada
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
