// Govt-scope case index. Lists every case whose jurisdiction matches
// the govt's active assignments (province + locality). Admins see the
// same view but redirected via /admin/casos.

import Link from "next/link";
import { redirect } from "next/navigation";

import { CaseBadge } from "@/components/CaseBadge";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { listCasesForGovt } from "@/lib/case-queries";
import { formatDate } from "@/lib/format";

export default async function GovtCasosPage() {
  const session = await requireAdminOrGovtOrRedirect();
  if (session.profile.role === "admin") redirect("/admin/casos");

  const items = await listCasesForGovt(session.jurisdictions);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Casos regulatorios
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Casos</h1>
        <p className="text-[13px] text-ln-op-mute">Expedientes en tu jurisdicción asignada.</p>
      </header>

      {session.jurisdictions.length === 0 ? (
        <p className="rounded-[6px] border border-dashed border-ln-op-line p-8 text-center text-[13px] text-ln-op-mute">
          No tenés jurisdicciones asignadas todavía.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-[6px] border border-dashed border-ln-op-line p-8 text-center text-[13px] text-ln-op-mute">
          Sin casos en tu jurisdicción por ahora.
        </p>
      ) : (
        <OpCard>
          <OpCardHead title={`${items.length} caso${items.length === 1 ? "" : "s"}`} />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line-2">
              {items.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-3 px-4 py-3 odd:bg-ln-op-stripe md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <CaseBadge
                      publicCode={c.publicCode}
                      caseKind={c.caseKind}
                      status={c.status}
                      size="sm"
                    />
                    <span className="text-[12px] text-ln-op-mute">
                      {c.jurisdictionLocality}, {c.jurisdictionProvince} · Abierto el{" "}
                      {formatDate(c.openedAt)}
                      {c.closedAt ? ` · Cerrado el ${formatDate(c.closedAt)}` : ""}
                    </span>
                  </div>
                  {c.primaryPetPublicToken && c.primaryPetName ? (
                    <Link
                      href={`/mis-mascotas/${c.primaryPetPublicToken}`}
                      className="inline-flex items-center rounded-full bg-ln-op-stripe border border-ln-op-line px-3 py-1.5 text-[13px] text-ln-op-ink transition hover:bg-ln-op-line no-underline"
                    >
                      🐾 {c.primaryPetName}
                    </Link>
                  ) : (
                    <span className="text-[13px] text-ln-op-mute">Caso sin mascota registrada</span>
                  )}
                </li>
              ))}
            </ul>
          </OpCardBody>
        </OpCard>
      )}
    </main>
  );
}
