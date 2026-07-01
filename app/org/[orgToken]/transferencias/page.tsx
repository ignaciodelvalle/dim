// Sender-side outgoing transfers list. Shows every
// custody_transfer_handshake case the org opened — open + closed.

// ---------------------------------------------------------------------------
// WIRED (sprint 5 PR-047 — 2026-05-27)
//
// Reachable from the org dashboard "Transferencias pendientes" count card.
// Sender flow itself is wired by PR-033 (ProposeTransferForm as wizard).
// ---------------------------------------------------------------------------

import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpCrumbs, OpPill } from "@/components/ui/dashboard";
import { cases, db, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { formatDate } from "@/lib/utils/format";

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

const STATUS_PILL_TONE: Record<string, "ok" | "open" | "danger" | "neutral" | "escalated"> = {
  open: "open",
  escalated: "escalated",
  closed: "neutral",
  merged: "neutral",
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
    <div className="space-y-6">
      <OpCrumbs
        items={[
          { label: "Panel", href: `/org/${orgToken}` },
          { label: "Transferencias salientes" },
        ]}
      />

      <header className="flex items-baseline justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Transferencias salientes</h1>
          <p className="text-[13px] text-ln-op-mute">
            Propuestas que {organization.displayName} envió a otras organizaciones.
          </p>
        </div>
        <Link
          href={`/org/${orgToken}/transferencias/nueva`}
          className="inline-flex items-center rounded-[6px] bg-ln-op-azul px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90 transition-opacity no-underline"
        >
          + Nueva propuesta
        </Link>
      </header>

      <nav className="flex gap-4 text-sm">
        <span className="font-semibold text-ln-op-ink">Salientes</span>
        <Link
          href={`/org/${orgToken}/transferencias/recibidas`}
          className="text-ln-op-azul hover:underline no-underline"
        >
          Entrantes →
        </Link>
      </nav>

      {handshakeRows.length === 0 ? (
        <LnEmptyState icon="transferencia" title="Todavía no propusiste ninguna transferencia." />
      ) : (
        <OpCard>
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line">
              {handshakeRows.map((r) => {
                const statusLabel =
                  r.status === "closed" && r.closedReason
                    ? (CLOSED_REASON_LABEL[r.closedReason] ?? STATUS_LABEL[r.status])
                    : (STATUS_LABEL[r.status] ?? r.status);
                return (
                  <li key={r.caseId} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-[13px] font-medium text-ln-op-ink">
                        {r.petName ?? "(sin pet)"}{" "}
                        <span className="font-mono text-sm text-ln-op-mute">· {r.publicCode}</span>
                      </p>
                      <p className="text-sm text-ln-op-mute">
                        Abierta el {formatDate(r.openedAt)}
                        {r.closedAt ? ` · Cerrada el ${formatDate(r.closedAt)}` : ""}
                      </p>
                      <Link
                        href={`/casos/${r.publicCode}`}
                        className="inline-block text-sm text-ln-op-azul hover:underline no-underline"
                      >
                        Ver caso →
                      </Link>
                    </div>
                    <OpPill tone={STATUS_PILL_TONE[r.status] ?? "neutral"}>{statusLabel}</OpPill>
                  </li>
                );
              })}
            </ul>
          </OpCardBody>
        </OpCard>
      )}
    </div>
  );
}
