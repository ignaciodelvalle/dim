import Link from "next/link";
import { notFound } from "next/navigation";

import { OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import {
  custodyDisputeParties,
  custodyDisputes,
  db,
  organizations,
  petEvents,
  pets,
  profiles,
} from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { speciesLabel } from "@/lib/utils/format";
import { and, desc, eq, inArray } from "drizzle-orm";

import { AddPartyForm } from "./AddPartyForm";
import { EscalateDisputeForm } from "./EscalateDisputeForm";
import { ResolveDisputeForm } from "./ResolveDisputeForm";
import { WithdrawDisputeButton } from "./WithdrawDisputeButton";

const PARTY_ROLE_LABELS: Record<string, string> = {
  current_owner: "Dueño actual",
  claimant_owner: "Reclamante",
  current_org_custody: "Organización en custodia",
  claimant_org: "Organización reclamante",
  witness: "Testigo",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Abierta",
  resolved: "Resuelta",
  withdrawn: "Retirada",
};

type StatusPillTone = "open" | "ok" | "neutral";

const STATUS_TONE: Record<string, StatusPillTone> = {
  open: "open",
  resolved: "ok",
  withdrawn: "neutral",
};

export default async function DisputeDetailPage({
  params,
}: {
  params: Promise<{ disputeToken: string }>;
}) {
  const { disputeToken } = await params;
  const { profile, jurisdictions, user } = await requireAdminOrGovtOrRedirect();

  const [row] = await db
    .select({ dispute: custodyDisputes, pet: pets })
    .from(custodyDisputes)
    .innerJoin(pets, eq(pets.id, custodyDisputes.petId))
    .where(eq(custodyDisputes.publicToken, disputeToken))
    .limit(1);
  if (!row) notFound();
  const { dispute, pet } = row;

  // Govt scope guard.
  if (profile.role === "govt") {
    const inScope = jurisdictions.some(
      (j) =>
        j.province === dispute.jurisdictionProvince && j.locality === dispute.jurisdictionLocality,
    );
    if (!inScope) notFound();
  }

  const parties = await db
    .select({
      party: custodyDisputeParties,
      userProfile: profiles,
      org: organizations,
    })
    .from(custodyDisputeParties)
    .leftJoin(profiles, eq(profiles.id, custodyDisputeParties.partyUserId))
    .leftJoin(organizations, eq(organizations.id, custodyDisputeParties.partyOrganizationId))
    .where(eq(custodyDisputeParties.disputeId, dispute.id))
    .orderBy(custodyDisputeParties.addedAt);

  // Pet timeline filtered to custody-related events. Read-only context for the
  // resolver -- full history lives in the pet detail surfaces.
  const CUSTODY_EVENT_TYPES = [
    "pet_registered",
    "custody_transferred",
    "custody_transfer_proposed",
    "shelter_intake_recorded",
    "foster_assigned",
    "foster_ended",
    "adoption_finalized",
    "adoption_withdrawn",
    "adoption_revoked",
    "abandonment_reported",
    "custody_dispute_raised",
    "custody_dispute_resolved",
  ] as const;
  const timeline = await db
    .select({
      id: petEvents.id,
      eventType: petEvents.eventType,
      occurredAt: petEvents.occurredAt,
      authorRole: petEvents.authorRole,
    })
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), inArray(petEvents.eventType, [...CUSTODY_EVENT_TYPES])))
    .orderBy(desc(petEvents.occurredAt))
    .limit(25);

  const canResolve = dispute.status === "open";
  const canWithdraw =
    dispute.status === "open" && (profile.role === "admin" || dispute.raisedByUserId === user.id);

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-2">
        <Link
          href="/gob/disputas"
          className="text-[13px] text-ln-op-mute hover:text-ln-op-ink underline underline-offset-4"
        >
          {"←"} Volver a la lista
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold text-ln-op-ink">{pet.name}</h1>
          <OpPill tone={STATUS_TONE[dispute.status] ?? "neutral"}>
            {STATUS_LABELS[dispute.status] ?? dispute.status}
          </OpPill>
        </div>
        <p className="text-[13px] text-ln-op-mute">
          {speciesLabel(pet.species)}
          {pet.breed && ` · ${pet.breed}`} · {dispute.jurisdictionLocality},{" "}
          {dispute.jurisdictionProvince}
        </p>
        <p className="text-xs text-ln-op-faint font-mono">{dispute.publicToken}</p>
      </header>

      {dispute.status === "open" && (
        <div className="rounded-[6px] border border-ln-op-warn-bd bg-ln-op-warn-bg p-3 text-[13px] text-ln-op-warn">
          Disputa abierta — la mascota queda bloqueada para transferencias o adopción hasta que se
          resuelva o retire.
        </div>
      )}

      {dispute.status === "resolved" && dispute.resolutionSummary && (
        <section className="rounded-[6px] border border-ln-op-ok-bd bg-ln-op-ok-bg p-4 space-y-2">
          <p className="text-[13px] font-medium text-ln-op-ok">Resolucion: {dispute.resolution}</p>
          <p className="text-[13px] text-ln-op-ok whitespace-pre-wrap">
            {dispute.resolutionSummary}
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ln-op-ink">Partes</h2>
        {parties.length === 0 ? (
          <p className="text-[13px] text-ln-op-mute">Sin partes registradas todavia.</p>
        ) : (
          <ul className="space-y-2">
            {parties.map(({ party, userProfile, org }) => (
              <li key={party.id}>
                <OpCard>
                  <OpCardBody>
                    <p className="text-[13px] font-medium text-ln-op-ink">
                      {userProfile?.displayName ?? org?.displayName ?? "Desconocido"}
                      <span className="ml-2 text-sm text-ln-op-mute font-normal">
                        {PARTY_ROLE_LABELS[party.partyRole] ?? party.partyRole}
                      </span>
                    </p>
                    {party.partyPositionSummary && (
                      <p className="text-sm text-ln-op-mute mt-1">{party.partyPositionSummary}</p>
                    )}
                    <p className="text-xs text-ln-op-faint mt-1">
                      Sumada el{" "}
                      {new Date(party.addedAt).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </OpCardBody>
                </OpCard>
              </li>
            ))}
          </ul>
        )}
        {canResolve && <AddPartyForm disputeToken={disputeToken} />}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ln-op-ink">Historia de custodia</h2>
        {timeline.length === 0 ? (
          <p className="text-[13px] text-ln-op-mute">Sin eventos de custodia previos.</p>
        ) : (
          <ul className="space-y-1.5 text-[13px]">
            {timeline.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline justify-between gap-3 border-l-2 border-ln-op-line pl-3 py-1"
              >
                <span className="font-mono text-sm text-ln-op-ink-2">{e.eventType}</span>
                <span className="text-sm text-ln-op-mute whitespace-nowrap">
                  {new Date(e.occurredAt).toLocaleDateString("es-AR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {e.authorRole && <span className="ml-2 text-ln-op-faint">· {e.authorRole}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canResolve && (
        <section className="space-y-3 pt-2 border-t border-ln-op-line">
          <h2 className="text-base font-semibold text-ln-op-ink">Resolver disputa</h2>
          <ResolveDisputeForm disputeToken={disputeToken} />
          <div className="pt-2 space-y-2">
            <p className="text-sm text-ln-op-mute">Otras acciones</p>
            <EscalateDisputeForm disputeToken={disputeToken} />
            {canWithdraw && <WithdrawDisputeButton disputeToken={disputeToken} />}
          </div>
        </section>
      )}
    </div>
  );
}
