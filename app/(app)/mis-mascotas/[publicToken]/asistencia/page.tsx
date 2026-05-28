import Link from "next/link";
import { notFound } from "next/navigation";

import { type Pet, db, ownerships, petServiceDog, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { and, eq, isNull } from "drizzle-orm";

import { ServiceDogForm } from "./ServiceDogForm";

// es-AR labels for non-owner ownership roles. Surfaces in the friendly
// "owner-only" page so the visitor sees their actual relationship to
// the pet instead of a bare 404.
const ROLE_LABELS: Record<string, string> = {
  shelter_custody: "custodia temporal (tránsito)",
  foster: "tránsito formal",
  co_owner: "co-dueño",
  caretaker: "cuidador",
};

function FriendlyOwnerOnlyPage({ pet, role }: { pet: Pet; role: string }) {
  const roleLabel = ROLE_LABELS[role] ?? role;
  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-4">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="text-sm text-gob-text-muted hover:text-gob-text "
        >
          ← Volver al perfil
        </Link>
        <h1 className="text-2xl font-semibold text-gob-text ">Perro de asistencia · {pet.name}</h1>
        <div className="rounded-lg border border-gob-warning bg-gob-warning/10   p-4 text-sm text-gob-warning-text  space-y-2">
          <p className="font-medium">
            La credencial de perro de asistencia (Ley 26.858) se registra solo bajo dueño legal
            permanente.
          </p>
          <p>
            Tu vínculo actual con <strong>{pet.name}</strong> es de <strong>{roleLabel}</strong>.
            Para registrar al animal como de asistencia, primero debe completarse la transferencia
            legal de custodia (adopción finalizada o pase a dueño definitivo).
          </p>
        </div>
      </div>
    </main>
  );
}

const STATUS_LABELS: Record<string, string> = {
  en_entrenamiento: "En entrenamiento",
  pendiente_verificacion: "Pendiente de verificación",
  vigente: "Vigente",
  vencida: "Vencida",
  revocada: "Revocada",
};

const STATUS_TONE: Record<string, string> = {
  vigente: "bg-gob-success/10  text-gob-success ",
  pendiente_verificacion: "bg-gob-warning/10  text-gob-warning-text ",
  en_entrenamiento: "bg-gob-surface-alt  text-gob-text-gray ",
  vencida: "bg-gob-danger/10  text-gob-danger ",
  revocada: "bg-gob-danger/10  text-gob-danger ",
};

export default async function AsistenciaPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const { user } = await requireUserOrRedirect();

  // Two-step access check (fix-service-dog-404 plan):
  //   1. Resolve any active ownership the caller has on the pet. No row
  //      means the pet is truly outside the caller's scope → bare 404.
  //   2. If the role is anything other than `owner`, the page surfaces a
  //      friendly explainer instead of a cryptic 404 — service-dog
  //      credentials are owner-only by law (Ley 26.858), but fosters /
  //      caretakers shouldn't be left guessing why the link broke.
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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-6">
        <Link
          href={`/mis-mascotas/${publicToken}`}
          className="text-sm text-gob-text-muted hover:text-gob-text "
        >
          ← Volver al perfil
        </Link>

        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-gob-text ">
            Perro de asistencia · {pet.name}
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Marco legal: <strong>Ley 26.858</strong> (acceso, deambulación y permanencia) ·
            Reglamentación: Decreto 792/2019 · Registro: <strong>RUPGA</strong> (ANDIS, Res.
            2588/2022).
          </p>
        </header>

        {pet.species !== "dog" && (
          <div className="rounded-lg border border-gob-warning bg-gob-warning/10   p-3 text-sm text-gob-warning-text ">
            Ley 26.858 reconoce este derecho de acceso solo para perros. Esta sección no aplica a{" "}
            <strong>{pet.species}</strong>.
          </div>
        )}

        {serviceDog && (
          <div className="rounded-lg border border-gob-border-strong  p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-gob-text ">Estado de la credencial</p>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  STATUS_TONE[serviceDog.credentialStatus] ?? ""
                }`}
              >
                {STATUS_LABELS[serviceDog.credentialStatus] ?? serviceDog.credentialStatus}
              </span>
            </div>
            <p className="text-xs text-gob-text-muted ">
              {serviceDog.inService ? "En servicio activo." : "Retirado del servicio."} Visibilidad
              pública del banner:{" "}
              <strong>
                {serviceDog.publicVisibility === "full_banner" ? "activada" : "solo privado"}
              </strong>
              .
            </p>
            {serviceDog.credentialStatus === "revocada" && serviceDog.revocationReason && (
              <p className="text-xs text-gob-danger  mt-1">
                Motivo de revocación: {serviceDog.revocationReason}
              </p>
            )}
            {serviceDog.credentialStatus === "vigente" && (
              <p className="text-xs text-gob-success  mt-1">
                Tu banner público está activo cuando elijas mostrarlo. Lo podés presentar en la
                puerta de un local, transporte o servicio público.
              </p>
            )}
          </div>
        )}

        <section className="rounded-lg border border-gob-info bg-gob-info/10   p-4 text-xs text-gob-azul-link  space-y-1">
          <p className="font-medium">Sobre tu privacidad (Ley 25.326)</p>
          <p>
            Registrar a tu perro como de asistencia revela información sobre tu discapacidad, que es
            un dato sensible bajo el Art. 7 de la Ley de Protección de Datos Personales. Por eso el
            banner público arranca apagado y tenés que activarlo vos. Solo se muestra cuando tu
            credencial está vigente y elegís hacerlo visible.
          </p>
        </section>

        {pet.species === "dog" && (
          <ServiceDogForm petPublicToken={publicToken} initial={serviceDog ?? null} />
        )}
      </div>
    </main>
  );
}
