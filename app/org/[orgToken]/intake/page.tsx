// Intake page — two tabs driven by ?tab= search param:
//   cola (default): recent pets that entered via intake (shelter_intake_recorded
//                   events authored by this org), ordered by occurredAt desc.
//   registrar:      the multi-step IntakeForm wizard.
//
// The createIntakeAction re-checks `intake.create` defensively, so this page
// is best-effort UX, not the security boundary.

import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { OpBreach, OpCard, OpCardBody, OpCardHead, OpCrumbs } from "@/components/ui/dashboard";
import { db, petEvents, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { formatDate } from "@/lib/format";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";

import { IntakeForm } from "./IntakeForm";

type TabKey = "cola" | "registrar";

const SPECIES_LABEL: Record<string, string> = {
  dog: "Perro",
  cat: "Gato",
  other: "Otra especie",
};

export default async function IntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgToken: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgToken } = await params;
  const { tab: tabParam } = await searchParams;
  const activeTab: TabKey = tabParam === "registrar" ? "registrar" : "cola";

  const { organization, membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);

  if (!granted.has("intake.create")) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Permiso requerido</h1>
          <p className="text-[13px] text-ln-op-mute">
            Para registrar ingresos necesitás el permiso{" "}
            <code className="text-[12px] font-mono">intake.create</code>. Pedíselo a un
            administrador desde el panel.
          </p>
          <Link
            href={`/org/${orgToken}`}
            className="inline-block rounded-[6px] bg-ln-op-azul px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity no-underline"
          >
            Volver al panel
          </Link>
        </div>
      </div>
    );
  }

  // Queue tab: last 100 pets registered via shelter_intake_recorded by this org.
  const intakeRows =
    activeTab === "cola"
      ? await db
          .select({
            eventId: petEvents.id,
            petId: pets.id,
            petName: pets.name,
            petPublicToken: pets.publicToken,
            petSpecies: pets.species,
            occurredAt: petEvents.occurredAt,
          })
          .from(petEvents)
          .innerJoin(pets, eq(pets.id, petEvents.petId))
          .where(
            and(
              eq(petEvents.eventType, "shelter_intake_recorded"),
              eq(petEvents.authorOrganizationId, organization.id),
            ),
          )
          .orderBy(desc(petEvents.occurredAt))
          .limit(100)
      : [];

  return (
    <div className="max-w-2xl space-y-6">
      <OpCrumbs items={[{ label: "Panel", href: `/org/${orgToken}` }, { label: "Ingresos" }]} />

      <header className="flex items-baseline justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[12px] uppercase tracking-wider text-ln-op-mute">
            {organization.displayName}
          </p>
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Ingresos</h1>
        </div>
        {activeTab === "cola" && (
          <Link
            href={`/org/${orgToken}/intake?tab=registrar`}
            className="inline-flex items-center rounded-[6px] bg-ln-op-azul px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90 transition-opacity no-underline"
          >
            + Nuevo ingreso
          </Link>
        )}
      </header>

      {/* Tab bar */}
      <nav className="flex gap-1 border-b border-ln-op-line">
        {(["cola", "registrar"] as const).map((tab) => {
          const isActive = activeTab === tab;
          const label = tab === "cola" ? "Cola de ingresos" : "Registrar";
          return (
            <Link
              key={tab}
              href={`/org/${orgToken}/intake?tab=${tab}`}
              className={`px-4 py-2 text-[13px] font-medium no-underline border-b-2 transition-colors ${
                isActive
                  ? "border-ln-op-azul text-ln-op-azul"
                  : "border-transparent text-ln-op-mute hover:text-ln-op-ink-2"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {activeTab === "cola" ? (
        intakeRows.length === 0 ? (
          <p className="rounded-[6px] border border-dashed border-ln-op-line p-8 text-center text-[13px] text-ln-op-mute">
            No hay ingresos registrados.{" "}
            <Link
              href={`/org/${orgToken}/intake?tab=registrar`}
              className="text-ln-op-azul hover:underline no-underline"
            >
              Registrar ingreso
            </Link>
          </p>
        ) : (
          <OpCard>
            <OpCardHead
              title="Ingresos recientes"
              actions={`${intakeRows.length} registro${intakeRows.length !== 1 ? "s" : ""}`}
            />
            <OpCardBody className="p-0">
              <ul className="divide-y divide-ln-op-line">
                {intakeRows.map((row) => (
                  <li
                    key={row.eventId}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[13px] font-medium text-ln-op-ink">{row.petName}</p>
                      <p className="text-[12px] text-ln-op-mute">
                        {SPECIES_LABEL[row.petSpecies] ?? row.petSpecies} ·{" "}
                        {formatDate(row.occurredAt)}
                      </p>
                    </div>
                    <Link
                      href={`/org/${orgToken}/mascotas/${row.petPublicToken}`}
                      className="shrink-0 rounded-[6px] border border-ln-op-line px-3 py-1.5 text-[12px] text-ln-op-ink hover:bg-ln-op-stripe transition-colors no-underline"
                    >
                      Ver ficha
                    </Link>
                  </li>
                ))}
              </ul>
            </OpCardBody>
          </OpCard>
        )
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] text-ln-op-mute">
            Cargá los datos básicos del animal y el motivo de ingreso. La organización queda como
            custodia temporal hasta que se asigne tránsito o se concrete una adopción.
          </p>
          <IntakeForm orgToken={orgToken} />
        </div>
      )}
    </div>
  );
}
