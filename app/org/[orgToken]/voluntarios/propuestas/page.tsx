import { LnEmptyState } from "@/components/ui/EmptyState";
import { db, fosterProposals, organizations, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { desc, eq } from "drizzle-orm";

import { CancelProposalButton } from "./CancelProposalButton";

const STATUS_LABELS = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Expirada",
  cancelled: "Cancelada",
} as const;

const STATUS_TONE: Record<string, string> = {
  pending: "text-ln-op-warn",
  accepted: "text-ln-op-ok",
  rejected: "text-ln-op-mute",
  expired: "text-ln-op-mute",
  cancelled: "text-ln-op-mute",
};

export default async function OrgPropuestasPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgToken: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgToken } = await params;
  const { organization } = await requireOrgAccessByToken(orgToken);
  const filters = await searchParams;

  const rows = await db
    .select({
      proposal: fosterProposals,
      pet: pets,
      volunteer: profiles,
    })
    .from(fosterProposals)
    .innerJoin(pets, eq(pets.id, fosterProposals.petId))
    .innerJoin(profiles, eq(profiles.id, fosterProposals.volunteerUserId))
    .where(eq(fosterProposals.organizationId, organization.id))
    .orderBy(desc(fosterProposals.proposedAt))
    .limit(200);

  const filtered = filters.status ? rows.filter((r) => r.proposal.status === filters.status) : rows;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Voluntarios</p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          Propuestas de tránsito emitidas
        </h1>
        <p className="mt-1 text-[13px] text-ln-op-mute">
          Propuestas que tu organización envió al pool de voluntarios.
        </p>
      </header>

      {/* Tab bar — Pool links to the index; Propuestas is this page */}
      <nav className="flex gap-1 border-b border-ln-op-line">
        <a
          href={`/org/${orgToken}/voluntarios`}
          className="px-4 py-2 text-[13px] font-medium no-underline border-b-2 border-transparent text-ln-op-mute hover:text-ln-op-ink-2 transition-colors"
        >
          Pool
        </a>
        <span
          className="px-4 py-2 text-[13px] font-medium border-b-2 border-ln-op-azul text-ln-op-azul"
          aria-current="page"
        >
          Propuestas
        </span>
      </nav>

      <div className="flex flex-wrap gap-2">
        <FilterLink orgToken={orgToken} current={filters.status} value={null} label="Todas" />
        {(["pending", "accepted", "rejected", "expired", "cancelled"] as const).map((s) => (
          <FilterLink
            key={s}
            orgToken={orgToken}
            current={filters.status}
            value={s}
            label={STATUS_LABELS[s]}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <LnEmptyState icon="propuesta" title="No hay propuestas." />
      ) : (
        <ul className="space-y-2">
          {filtered.map(({ proposal, pet, volunteer }) => (
            <li
              key={proposal.id}
              className="rounded-[6px] border border-ln-op-line bg-ln-op-card p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-[13px] font-medium text-ln-op-ink">
                    {volunteer.displayName}{" "}
                    <span className="font-normal text-ln-op-mute">→ {pet.name}</span>
                  </p>
                  <p className="text-sm text-ln-op-mute">
                    {new Date(proposal.proposedAt).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    ·{" "}
                    <span className={STATUS_TONE[proposal.status] ?? ""}>
                      {STATUS_LABELS[proposal.status as keyof typeof STATUS_LABELS] ??
                        proposal.status}
                    </span>
                    {proposal.proposedDurationWeeks && ` · ${proposal.proposedDurationWeeks} sem.`}
                    {proposal.rejectionReason && ` · motivo: ${proposal.rejectionReason}`}
                  </p>
                </div>
                {proposal.status === "pending" && (
                  <CancelProposalButton proposalPublicToken={proposal.publicToken} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterLink({
  orgToken,
  current,
  value,
  label,
}: {
  orgToken: string;
  current: string | undefined;
  value: string | null;
  label: string;
}) {
  const href = value
    ? `/org/${orgToken}/voluntarios/propuestas?status=${value}`
    : `/org/${orgToken}/voluntarios/propuestas`;
  const active = (current ?? null) === value;
  return (
    <a
      href={href}
      className={[
        "rounded-full border px-3 py-[5px] text-sm no-underline transition-colors",
        active
          ? "border-ln-op-azul bg-ln-op-azul text-white"
          : "border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe",
      ].join(" ")}
    >
      {label}
    </a>
  );
}
