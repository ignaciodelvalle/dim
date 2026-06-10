// Perro de asistencia — Libreta Nacional redesign.
// Presentation only; ServiceDogForm and data fetching unchanged.

import Link from "next/link";
import { notFound } from "next/navigation";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnCallout } from "@/components/ui/DocElements";
import { type Pet, db, ownerships, petServiceDog, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { and, eq, isNull } from "drizzle-orm";
import { ServiceDogForm } from "./ServiceDogForm";

const ROLE_LABELS: Record<string, string> = {
  shelter_custody: "custodia temporal (tránsito)",
  foster: "tránsito formal",
  co_owner: "co-dueño",
  caretaker: "cuidador",
};

function FriendlyOwnerOnlyPage({ pet, role }: { pet: Pet; role: string }) {
  const roleLabel = ROLE_LABELS[role] ?? role;
  return (
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      <Link
        href={`/mis-mascotas/${pet.publicToken}`}
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Volver al perfil
      </Link>
      <h1 className="m-0 mb-[16px] font-[var(--font-ln-serif)] text-[24px] font-semibold text-[var(--color-ln-ink)]">
        Perro de asistencia · {pet.name}
      </h1>
      <LnCallout
        tone="warn"
        title="La credencial de asistencia se registra solo bajo dueño legal permanente."
      >
        Tu vínculo actual con <strong>{pet.name}</strong> es de <strong>{roleLabel}</strong>. Para
        registrar al animal como de asistencia, primero debe completarse la transferencia legal de
        custodia.
      </LnCallout>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  en_entrenamiento: "En entrenamiento",
  pendiente_verificacion: "Pendiente de verificación",
  vigente: "Vigente",
  vencida: "Vencida",
  revocada: "Revocada",
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "vigente":
      return "border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] text-[var(--color-ln-ok)]";
    case "pendiente_verificacion":
      return "border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)]";
    case "vencida":
    case "revocada":
      return "border-[var(--color-ln-err-100)] bg-[var(--color-ln-err-050)] text-[var(--color-ln-err)]";
    default:
      return "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)]";
  }
}

export default async function AsistenciaPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const { user } = await requireUserOrRedirect();

  const [accessRow] = await db
    .select({ pet: pets, role: ownerships.role })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerUserId, user.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!accessRow) notFound();
  if (accessRow.role !== "owner") {
    return <FriendlyOwnerOnlyPage pet={accessRow.pet} role={accessRow.role} />;
  }
  const pet = accessRow.pet;

  const [serviceDog] = await db
    .select()
    .from(petServiceDog)
    .where(eq(petServiceDog.petId, pet.id))
    .limit(1);

  return (
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href={`/mis-mascotas/${publicToken}`}
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← {pet.name}
      </Link>

      {/* Header */}
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]">
          Perro de asistencia · {pet.name}
        </h1>
        <p className="mt-[5px] text-[13px] text-[var(--color-ln-mute)]">
          Marco legal: <strong>Ley 26.858</strong> (acceso, deambulación y permanencia) ·
          Reglamentación: Decreto 792/2019 · Registro: <strong>RUPGA</strong> (ANDIS, Res.
          2588/2022).
        </p>
      </div>

      <div className="flex flex-col gap-[20px]">
        {pet.species !== "dog" && (
          <LnCallout tone="warn">
            Ley 26.858 reconoce este derecho de acceso solo para perros. Esta sección no aplica a{" "}
            <strong>{pet.species}</strong>.
          </LnCallout>
        )}

        {serviceDog && (
          <LnCard>
            <LnCardHead title="Estado de la credencial" />
            <LnCardBody>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-[var(--color-ln-ink-2)]">
                  {serviceDog.inService ? "En servicio activo." : "Retirado del servicio."}{" "}
                  Visibilidad pública:{" "}
                  <strong>
                    {serviceDog.publicVisibility === "full_banner" ? "activada" : "solo privado"}
                  </strong>
                  .
                </p>
                <span
                  className={`flex-shrink-0 inline-flex items-center rounded-[2px] border px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] ${statusBadgeClass(serviceDog.credentialStatus)}`}
                >
                  {STATUS_LABELS[serviceDog.credentialStatus] ?? serviceDog.credentialStatus}
                </span>
              </div>
              {serviceDog.credentialStatus === "revocada" && serviceDog.revocationReason && (
                <p className="mt-[8px] text-[12.5px] text-[var(--color-ln-err)]">
                  Motivo de revocación: {serviceDog.revocationReason}
                </p>
              )}
              {serviceDog.credentialStatus === "vigente" && (
                <p className="mt-[8px] text-[12.5px] text-[var(--color-ln-ok)]">
                  Tu banner público está activo cuando elegís mostrarlo. Lo podés presentar en la
                  puerta de un local, transporte o servicio público.
                </p>
              )}
            </LnCardBody>
          </LnCard>
        )}

        <LnCallout tone="azul" title="Sobre tu privacidad (Ley 25.326)">
          Registrar a tu perro como de asistencia revela información sobre tu discapacidad, que es
          un dato sensible bajo el Art. 7 de la Ley de Protección de Datos Personales. Por eso el
          banner público arranca apagado y tenés que activarlo vos. Solo se muestra cuando tu
          credencial está vigente y elegís hacerlo visible.
        </LnCallout>

        {pet.species === "dog" && (
          <ServiceDogForm petPublicToken={publicToken} initial={serviceDog ?? null} />
        )}
      </div>
    </div>
  );
}
