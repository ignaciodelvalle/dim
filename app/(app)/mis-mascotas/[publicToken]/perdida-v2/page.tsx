// Preview-only Modo Perdido cockpit for the owner.
//
// Reach via /mis-mascotas/{token}/perdida-v2. This is what the owner
// sees the moment after they activate lost mode. Once Phase 0 of the
// action plan is clean and the cases table is restored, this page's
// body should fold into a conditional branch of the live profile —
// when `pets.status === "lost"`, the profile shows this layout
// instead of the regular sections.
//
// All sample data inline. Real wiring needs:
//   - the open `lost_pet_episode` case for this pet (lib/case-queries)
//   - last-known location from the case row (primary_location_lat/lng)
//   - scan events: petEvents.filter(type='credential_scanned')
//   - finder messages: TBD, see lost-mode-plan.md open decisions
//
// Access: same `requirePetAccess` guard as the live profile.

import { LostDisclosureCard } from "@/components/pet-profile/LostDisclosureCard";
import { LostLastSeenCard } from "@/components/pet-profile/LostLastSeenCard";
import { LostModeBanner } from "@/components/pet-profile/LostModeBanner";
import { LostScanFeed, type ScanFeedItem } from "@/components/pet-profile/LostScanFeed";
import { LostShareCard } from "@/components/pet-profile/LostShareCard";
import { requirePetAccess } from "@/lib/pet-access";

export const dynamic = "force-dynamic";

export default async function PerdidaV2Page({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  await requirePetAccess(publicToken);

  const petName = "Roma";
  const lostSince = new Date(Date.now() - 3 * 60 * 60 * 1000 - 42 * 60 * 1000);
  const casePublicCode = "LOS-3F7A";

  const feed: ScanFeedItem[] = [
    {
      kind: "finder",
      id: "f1",
      at: new Date(Date.now() - 12 * 60 * 1000),
      finderName: "Carolina M.",
      snippet:
        "La vi en Plaza Italia, sigue con el collar rojo. Tengo foto si querés que te la mande.",
      distanceLabel: "5 cuadras",
      href: `/casos/${casePublicCode}/mensajes/f1`,
    },
    {
      kind: "scan",
      id: "s1",
      at: new Date(Date.now() - 32 * 60 * 1000),
      count: 1,
      localityLabel: "La Plata centro",
    },
    {
      kind: "finder",
      id: "f2",
      at: new Date(Date.now() - 60 * 60 * 1000),
      finderName: "J.P.",
      snippet: "Creo que la vi anoche cerca del parque. ¿Color marrón?",
      href: `/casos/${casePublicCode}/mensajes/f2`,
    },
    {
      kind: "scan",
      id: "s2",
      at: new Date(Date.now() - 2 * 60 * 60 * 1000),
      count: 5,
      localityLabel: "Berisso · entre 16:40 y 17:10",
    },
  ];

  // Server actions — bound here to keep prop types simple. In the real
  // wiring these come from app/actions/events.ts and app/actions/pets.ts.
  async function markFound() {
    "use server";
    // setPetFoundAction(publicToken) — emits status_changed → active,
    // closes the lost_pet_episode case atomically.
  }
  async function toggleDisclosure(_key: string, _next: boolean) {
    "use server";
    // setPetDisclosurePrefsAction(publicToken, partial) — atomic prefs update.
  }

  const publicUrl = `https://mimar.ar/p/${publicToken}`;
  const shareText = `${petName} está perdida en La Plata. Ayudanos a encontrarla — si la viste, escaneá su QR o entrá a:`;

  return (
    <main className="min-h-screen bg-white p-5 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl space-y-4 pb-12">
        <LostModeBanner
          petName={petName}
          petPhotoUrl={null}
          lostSince={lostSince}
          casePublicCode={casePublicCode}
          jurisdictionLabel="La Plata"
          markFoundAction={markFound}
        />

        <LostShareCard
          publicUrl={publicUrl}
          shareText={shareText}
          posterHref={`/casos/${casePublicCode}/afiche.pdf`}
        />

        <LostLastSeenCard
          placeName="Plaza Italia"
          localityLabel="La Plata"
          at={new Date("2026-05-16T18:30:00-03:00")}
          note="Salió por la puerta del frente, llevaba collar rojo."
          editHref={`/mis-mascotas/${publicToken}/perdida/editar-ubicacion`}
          addSightingHref={`/mis-mascotas/${publicToken}/perdida/avistamiento`}
          sightingsCount={2}
        />

        <LostDisclosureCard
          ownerFirstName="Ignacio"
          publicHref={`/p/${publicToken}`}
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          toggleAction={toggleDisclosure as never}
          prefs={{
            discloseFirstNameWhenLost: true,
            disclosePhoneWhenLost: true,
            discloseEmailWhenLost: false,
            discloseLastLocationWhenLost: true,
            allowFinderFormWhenLost: true,
          }}
        />

        <LostScanFeed
          items={feed}
          totalScans={18}
          totalFinderMessages={3}
          caseHref={`/casos/${casePublicCode}`}
        />

        <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
          Cuando vuelva a casa, tocá <strong>Marcar encontrada</strong> arriba. El QR vuelve a la
          vista normal y se cierra el caso.
        </p>
      </div>
    </main>
  );
}
