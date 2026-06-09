// Admin-scope case index - universal view across all jurisdictions.

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
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Casos</h1>
        <p className="text-[13px] text-ln-op-mute">
          Expedientes registrados en el sistema. Vista universal admin.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-[6px] border border-dashed border-ln-op-line p-8 text-center text-[13px] text-ln-op-mute">
          Sin casos registrados todavia.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-1">
                <CaseBadge
                  publicCode={c.publicCode}
                  caseKind={c.caseKind}
                  status={c.status}
                  size="sm"
                />
                <span className="text-[12px] text-ln-op-mute">
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
                  className="inline-flex items-center rounded-full bg-ln-op-stripe px-3 py-1.5 text-[13px] text-ln-op-ink-2 no-underline transition-colors hover:bg-ln-op-line"
                >
                  &#128062; {c.primaryPetName}
                </Link>
              ) : (
                <span className="text-[13px] text-ln-op-mute">Caso sin mascota registrada</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
