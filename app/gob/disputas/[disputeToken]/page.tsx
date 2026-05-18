import Link from "next/link";
import { notFound } from "next/navigation";

import {
  custodyDisputeParties,
  custodyDisputes,
  db,
  organizations,
  petEvents,
  pets,
  profiles,
} from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { and, desc, eq, inArray, or } from "drizzle-orm";

import { AddPartyForm } from "./AddPartyForm";
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
  // resolver — full history lives in the pet detail surfaces.
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
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <Link
            href="/gob/disputas"
            className="text-sm text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50 underline underline-offset-4"
          >
            ← Volver a la lista
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
              {pet.name}
            </h1>
            <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200">
              {STATUS_LABELS[dispute.status] ?? dispute.status}
            </span>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {pet.species}
            {pet.breed && ` · ${pet.breed}`} · {dispute.jurisdictionLocality},{" "}
            {dispute.jurisdictionProvince}
          </p>
          <p className="text-[10px] text-neutral-400 dark:text-neutral-600 font-mono">
            {dispute.publicToken}
          </p>
        </header>

        {dispute.status === "open" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-100">
            Disputa abierta — la mascota queda bloqueada para transferencias o adopción hasta que se
            resuelva o retire.
          </div>
        )}

        {dispute.status === "resolved" && dispute.resolutionSummary && (
          <section className="rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-4 space-y-2">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              Resolución: {dispute.resolution}
            </p>
            <p className="text-sm text-emerald-900 dark:text-emerald-100 whitespace-pre-wrap">
              {dispute.resolutionSummary}
            </p>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Partes</h2>
          {parties.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin partes registradas todavía.</p>
          ) : (
            <ul className="space-y-2">
              {parties.map(({ party, userProfile, org }) => (
                <li
                  key={party.id}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3 space-y-1"
                >
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {userProfile?.displayName ?? org?.displayName ?? "Desconocido"}
                    <span className="ml-2 text-xs text-neutral-500 font-normal">
                      {PARTY_ROLE_LABELS[party.partyRole] ?? party.partyRole}
                    </span>
                  </p>
                  {party.partyPositionSummary && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {party.partyPositionSummary}
                    </p>
                  )}
                  <p className="text-[10px] text-neutral-400 dark:text-neutral-600">
                    Sumada el{" "}
                    {new Date(party.addedAt).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {canResolve && <AddPartyForm disputeToken={disputeToken} />}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Historia de custodia
          </h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin eventos de custodia previos.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {timeline.map((e) => (
                <li
                  key={e.id}
                  className="flex items-baseline justify-between gap-3 border-l-2 border-neutral-200 dark:border-neutral-800 pl-3 py-1"
                >
                  <span className="font-mono text-xs">{e.eventType}</span>
                  <span className="text-xs text-neutral-500">
                    {new Date(e.occurredAt).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {e.authorRole && (
                      <span className="ml-2 text-neutral-400">· {e.authorRole}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canResolve && (
          <section className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              Resolver disputa
            </h2>
            <ResolveDisputeForm disputeToken={disputeToken} />
            {canWithdraw && (
              <div className="pt-2">
                <WithdrawDisputeButton disputeToken={disputeToken} />
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
