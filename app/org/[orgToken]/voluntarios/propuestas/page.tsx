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
  pending: "text-amber-700 dark:text-amber-300",
  accepted: "text-emerald-700 dark:text-emerald-300",
  rejected: "text-neutral-500",
  expired: "text-neutral-500",
  cancelled: "text-neutral-500",
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
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-4xl mx-auto pt-10 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Propuestas de tránsito emitidas
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Propuestas que tu organización envió al pool de voluntarios.
          </p>
        </header>

        <div className="flex gap-2 text-sm">
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
          <p className="text-sm text-neutral-500 py-8 text-center">No hay propuestas.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map(({ proposal, pet, volunteer }) => (
              <li
                key={proposal.id}
                className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">
                      {volunteer.displayName}{" "}
                      <span className="text-neutral-500 font-normal">→ {pet.name}</span>
                    </p>
                    <p className="text-xs text-neutral-500">
                      {new Date(proposal.proposedAt).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      ·{" "}
                      <span className={STATUS_TONE[proposal.status] ?? ""}>
                        {STATUS_LABELS[proposal.status as keyof typeof STATUS_LABELS] ??
                          proposal.status}
                      </span>
                      {proposal.proposedDurationWeeks &&
                        ` · ${proposal.proposedDurationWeeks} sem.`}
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
    </main>
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
      className={`px-3 py-1 rounded-full border text-xs ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-50 dark:bg-neutral-50 dark:text-neutral-900"
          : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900"
      }`}
    >
      {label}
    </a>
  );
}
