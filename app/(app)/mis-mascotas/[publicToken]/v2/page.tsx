// Preview-only redesign of the owner pet profile.
//
// Sits alongside the live profile at /mis-mascotas/{token}; reach it via
// /mis-mascotas/{token}/v2. Composes the new pet-profile/* components
// with hardcoded sample data so it renders without the broken Drizzle
// schema (see action-plan-2026-05-20.md → Addendum → Finding 1).
//
// Migration once Phase 0 is verified clean:
//   - Replace sample data with the existing queries already used by
//     app/(app)/mis-mascotas/[publicToken]/page.tsx (requirePetAccess,
//     fetchPetEvents, etc.).
//   - Add the missing data dependencies: emergency contacts (profile
//     fields), weight-from-events selector, vaccine-reminder selector.
//
// Access: same `requirePetAccess` guard as the live profile.

import { PetCredentialCard } from "@/components/pet-profile/PetCredentialCard";
import { PetEmergencyCard } from "@/components/pet-profile/PetEmergencyCard";
import { PetHealthTimeline } from "@/components/pet-profile/PetHealthTimeline";
import { type PetHeroPet, PetProfileHero } from "@/components/pet-profile/PetProfileHero";
import { PetTrackingPlaceholder } from "@/components/pet-profile/PetTrackingPlaceholder";
import { PetTravelDocs } from "@/components/pet-profile/PetTravelDocs";
import { PetVaccineReminders } from "@/components/pet-profile/PetVaccineReminders";
import { PetWeightChart } from "@/components/pet-profile/PetWeightChart";
import { requirePetAccess } from "@/lib/pet-access";

export const dynamic = "force-dynamic";

export default async function PetProfileV2Page({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  await requirePetAccess(publicToken);

  // ---------------------------------------------------------------------
  // Sample data. Replace with live queries once Phase 0 is clean.
  // ---------------------------------------------------------------------
  const pet: PetHeroPet = {
    name: "Mishi",
    publicToken,
    photoUrl: null,
    species: "Felino",
    breed: "Siamés",
    ageLabel: "4 años",
    weightLabel: "4.2 kg",
    state: "attention",
    stateLabel: "Obs día 4/10",
    lostMode: false,
  };

  const weightSamples = [
    { date: new Date("2025-05-15"), kg: 3.8 },
    { date: new Date("2025-08-15"), kg: 3.95 },
    { date: new Date("2025-11-15"), kg: 4.0 },
    { date: new Date("2026-02-15"), kg: 4.1 },
    { date: new Date("2026-05-02"), kg: 4.2 },
  ];

  return (
    <main className="min-h-screen bg-white p-5 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl space-y-4 pb-12">
        <PetProfileHero pet={pet} />

        <PetEmergencyCard
          editHref="/cuenta/emergencia"
          vet={{
            role: "Vet de cabecera",
            name: "Dra. Pérez",
            phone: "+54 11 4567-8910",
          }}
          emergencyContact={{
            role: "Contacto emergencia",
            name: "Lucía F.",
            phone: "+54 11 6543-2109",
          }}
          alerts={[
            { id: "a1", text: "Alergia a la penicilina" },
            {
              id: "a2",
              text: "Observación antirrábica en curso (mordida 16/05)",
              href: `/mis-mascotas/${publicToken}/eventos/bite-16-05`,
            },
          ]}
        />

        <PetHealthTimeline
          fullHistoryHref={`/mis-mascotas/${publicToken}/historial`}
          events={[
            {
              id: "e1",
              kind: "incidente",
              title: "Incidente — mordedura en plaza",
              subtitle: "Inicia observación antirrábica · 10 días",
              dateLabel: "16/05",
              href: `/mis-mascotas/${publicToken}/eventos/e1`,
            },
            {
              id: "e2",
              kind: "vacuna",
              title: "Triple felina aplicada",
              subtitle: "Dra. Pérez · lote 7842",
              dateLabel: "08/05",
              href: `/mis-mascotas/${publicToken}/eventos/e2`,
            },
            {
              id: "e3",
              kind: "peso",
              title: "Peso: 4.2 kg",
              subtitle: "+0.1 vs marzo",
              dateLabel: "02/05",
              href: `/mis-mascotas/${publicToken}/eventos/e3`,
            },
            {
              id: "e4",
              kind: "vet",
              title: "Control general",
              subtitle: "Veterinaria Norte · sin hallazgos",
              dateLabel: "15/04",
              href: `/mis-mascotas/${publicToken}/eventos/e4`,
            },
          ]}
        />

        <PetWeightChart samples={weightSamples} />

        <PetVaccineReminders
          vaccinesHref={`/mis-mascotas/${publicToken}/vacunas`}
          scheduleHref={(r) => `/turnos/nuevo?pet=${publicToken}&service=vaccine&reminder=${r.id}`}
          reminders={[
            {
              id: "r1",
              name: "Antirrábica",
              subtitle: "vencida hace 15 días",
              dueAt: new Date("2026-05-05"),
            },
            {
              id: "r2",
              name: "Leucemia felina",
              subtitle: "Refuerzo anual",
              dueAt: new Date("2026-06-04"),
            },
          ]}
        />

        <PetTrackingPlaceholder href={`/mis-mascotas/${publicToken}/tracking`} />

        <PetCredentialCard
          publicToken={publicToken}
          qrUrl={`/p/${publicToken}.png`}
          publicHref={`/p/${publicToken}`}
        />

        <PetTravelDocs
          uploadHref={`/mis-mascotas/${publicToken}/editar?section=docs`}
          docs={[
            {
              id: "d1",
              kind: "pasaporte",
              label: "Pasaporte sanitario",
              caption: "vence 04/2028",
              href: `/mis-mascotas/${publicToken}/docs/pasaporte`,
            },
            {
              id: "d2",
              kind: "certificado_internacional",
              label: "Certif. internacional",
              caption: "no cargado",
              href: null,
            },
          ]}
        />
      </div>
    </main>
  );
}
