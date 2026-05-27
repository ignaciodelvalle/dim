// Govt-scope case index. Lists every case whose jurisdiction matches
// the govt's active assignments (province + locality). Admins see the
// same view but redirected via /admin/casos.

import Link from "next/link";
import { redirect } from "next/navigation";

import { CaseBadge } from "@/components/CaseBadge";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { listCasesForGovt } from "@/lib/case-queries";
import { formatDate } from "@/lib/format";

export default async function GovtCasosPage() {
  const session = await requireAdminOrGovtOrRedirect();
  if (session.profile.role === "admin") redirect("/admin/casos");

  const items = await listCasesForGovt(session.jurisdictions);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gob-text">Casos</h1>
        <p className="mt-1 text-sm text-gob-text-gray">Expedientes en tu jurisdicción asignada.</p>
      </header>

      {session.jurisdictions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gob-border p-8 text-center text-sm text-gob-text-muted">
          No tenés jurisdicciones asignadas todavía.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gob-border p-8 text-center text-sm text-gob-text-muted">
          Sin casos en tu jurisdicción por ahora.
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
                  {c.jurisdictionLocality}, {c.jurisdictionProvince} · Abierto el{" "}
                  {formatDate(c.openedAt)}
                  {c.closedAt ? ` · Cerrado el ${formatDate(c.closedAt)}` : ""}
                </span>
              </div>
              {c.primaryPetPublicToken && c.primaryPetName ? (
                <Link
                  href={`/mis-mascotas/${c.primaryPetPublicToken}`}
                  className="inline-flex items-center rounded-full bg-gob-surface-alt px-3 py-1.5 text-sm text-gob-text-gray transition hover:opacity-80"
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
