// Sender-side outgoing transfers list. Shows every
// custody_transfer_handshake case the org opened — open + closed.

// ---------------------------------------------------------------------------
// DEFERRED BY DESIGN (audit-internal-roles-pages PR2/9 — 2026-05-26)
//
// This page exists but is NOT reachable from any nav or dashboard CTA. The
// underlying flow (cross-org transfer handshake) is not yet wired end-to-end.
// Keep this page intact — when the flow lands, add a nav entry in
// `components/poncho/Layout/nav-presets.ts` or a CTA on the org dashboard.
//
// Wire after the cross-org transfer epic finishes; currently the UI exists
// but has no nav surface or dashboard entry point.
//
// Audited: 2026-05-26. Re-evaluate during next role audit.
// ---------------------------------------------------------------------------

import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { cases, db, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { formatDate } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  open: "Esperando respuesta",
  escalated: "Escalada",
  closed: "Cerrada",
  merged: "Fusionada",
};

const CLOSED_REASON_LABEL: Record<string, string> = {
  resolved: "Aceptada",
  cancelled: "Cancelada",
  auto_expired: "Expirada (30d sin respuesta)",
  merged: "Fusionada",
};

export default async function OrgTransferenciasSalientesPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization } = await requireOrgAccessByToken(orgToken);

  const rows = await db
    .select({
      caseId: cases.id,
      publicCode: cases.publicCode,
      status: cases.status,
      closedReason: cases.closedReason,
      openedAt: cases.openedAt,
      closedAt: cases.closedAt,
      petName: pets.name,
      petPublicToken: pets.publicToken,
    })
    .from(cases)
    .leftJoin(pets, eq(pets.id, cases.primaryPetId))
    .where(
      and(
        eq(cases.openedByOrganizationId, organization.id),
        eq(cases.caseKind, "custody_transfer_handshake"),
      ),
    )
    .orderBy(desc(cases.openedAt))
    .limit(200);

  const handshakeRows = rows;

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto pt-10 space-y-6">
        <Link
          href={`/org/${orgToken}`}
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver al panel
        </Link>

        <header className="flex items-baseline justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Transferencias salientes
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Propuestas que {organization.displayName} envió a otras organizaciones.
            </p>
          </div>
          <Link
            href={`/org/${orgToken}/transferencias/nueva`}
            className="inline-flex items-center rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
          >
            + Nueva propuesta
          </Link>
        </header>

        <nav className="text-xs text-neutral-500 dark:text-neutral-400 flex gap-3">
          <span className="font-medium text-neutral-900 dark:text-neutral-50">Salientes</span>
          <Link
            href={`/org/${orgToken}/transferencias/recibidas`}
            className="hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            Entrantes →
          </Link>
        </nav>

        {handshakeRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
            Todavía no propusiste ninguna transferencia.
          </p>
        ) : (
          <ul className="space-y-3">
            {handshakeRows.map((r) => (
              <li
                key={r.caseId}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {r.petName ?? "(sin pet)"}{" "}
                      <span className="font-mono text-xs text-neutral-400 dark:text-neutral-600">
                        · {r.publicCode}
                      </span>
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-500">
                      Abierta el {formatDate(r.openedAt)}
                      {r.closedAt ? ` · Cerrada el ${formatDate(r.closedAt)}` : ""}
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    {r.status === "closed" && r.closedReason
                      ? (CLOSED_REASON_LABEL[r.closedReason] ?? STATUS_LABEL[r.status])
                      : (STATUS_LABEL[r.status] ?? r.status)}
                  </span>
                </div>
                <Link
                  href={`/casos/${r.publicCode}`}
                  className="inline-block text-xs underline text-neutral-700 dark:text-neutral-300 hover:text-neutral-900"
                >
                  Ver caso →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
