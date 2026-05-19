// Admin-scope case index — universal view across all jurisdictions.

import Link from "next/link";

import { CaseBadge } from "@/components/CaseBadge";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { listCasesForAdmin } from "@/lib/case-queries";
import { formatDate } from "@/lib/format";
import { redirect } from "next/navigation";

export default async function AdminCasosPage() {
  const session = await requireAdminOrGovtOrRedirect();
  if (session.profile.role !== "admin") redirect("/gob/casos");

  const items = await listCasesForAdmin();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Casos</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Expedientes registrados en el sistema. Vista universal admin.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Sin casos registrados todavía.
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
                  {c.jurisdictionLocality && c.jurisdictionProvince
                    ? `${c.jurisdictionLocality}, ${c.jurisdictionProvince} · `
                    : ""}
                  Abierto el {formatDate(c.openedAt)}
                  {c.closedAt ? ` · Cerrado el ${formatDate(c.closedAt)}` : ""}
                </span>
              </div>
              {c.primaryPetPublicToken && c.primaryPetName ? (
                <Link
                  href={`/mis-mascotas/${c.primaryPetPublicToken}`}
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
