// /mis-mascotas/[publicToken]/cartel — printable lost-pet poster (A4).
//
// Gate: requirePetAccess. If pet.status !== 'lost', renders a "mark as lost first"
// message instead of the poster.

import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { attachments, db, ownerships, profiles } from "@/db";
import { ageFromDateOfBirth, sexLabel, speciesLabel } from "@/lib/format";
import { fetchLostEpisodeForPet } from "@/lib/lost-mode";
import { requirePetAccess } from "@/lib/pet-access";
import { petPhotoUrl } from "@/lib/storage";

import "./cartel-print.css";
import { PosterPreview } from "./PosterPreview";

export default async function CartelPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  const { pet } = access;

  // Guard: poster only makes sense when the pet is marked lost.
  if (pet.status !== "lost") {
    return (
      <main className="min-h-screen p-6 bg-white">
        <div className="max-w-md mx-auto pt-12 space-y-6 text-center">
          <p className="text-lg font-semibold text-gob-text">
            {pet.name} no está marcada como perdida.
          </p>
          <p className="text-sm text-gob-text-gray">
            Marcala como perdida primero para generar el cartel.
          </p>
          <Link
            href={`/mis-mascotas/${publicToken}?sheet=marcar-perdida`}
            className="inline-block px-5 py-2.5 rounded-lg bg-gob-warning text-white font-medium hover:bg-gob-warning transition-colors"
          >
            Marcar como perdida
          </Link>
        </div>
      </main>
    );
  }

  // Fetch lost episode (placeName + lostSince).
  const episode = await fetchLostEpisodeForPet(pet.id);

  // Resolve owner first name + phone from the active ownership row.
  // Mirrors the pattern in /p/[publicToken]/page.tsx (Tier 1 reveal).
  // NOTE: isNull(endedAt) is required — without it a transferred pet would return
  // the PREVIOUS owner's row, leaking their PII onto the poster.
  // EMAIL is intentionally omitted: discloseEmailWhenLost is not surfaced here
  // by design — phone/firstName/location only (Tier 1 contact subset for print).
  const [ownerRow] = await db
    .select({ profile: profiles })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
    .limit(1);

  const rawFirstName = ownerRow?.profile.displayName
    ? ownerRow.profile.displayName.trim().split(/\s+/)[0]
    : null;
  const rawPhone = ownerRow?.profile.phone ?? null;

  // Apply disclosure prefs — only pass values the owner has opted to disclose.
  const ownerFirstName = pet.discloseFirstNameWhenLost ? rawFirstName : null;
  const ownerPhone = pet.disclosePhoneWhenLost ? rawPhone : null;

  // Resolve photo URL (pet-photos bucket is public).
  let photoUrl: string | null = null;
  if (pet.primaryPhotoId) {
    const [photo] = await db
      .select({ storagePath: attachments.storagePath })
      .from(attachments)
      .where(eq(attachments.id, pet.primaryPhotoId))
      .limit(1);
    photoUrl = petPhotoUrl(photo?.storagePath);
  }

  // Generate QR SVG server-side pointing at the public credential page.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mimar.ar";
  const qrTargetUrl = `${baseUrl}/p/${publicToken}`;
  const qrSvg = await QRCode.toString(qrTargetUrl, {
    type: "svg",
    margin: 1,
    width: 180,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="min-h-screen bg-gob-surface-alt print:bg-white">
      <PosterPreview
        publicToken={publicToken}
        petName={pet.name}
        species={speciesLabel(pet.species)}
        breed={pet.breed ?? null}
        sex={sexLabel(pet.sex)}
        age={ageFromDateOfBirth(pet.dateOfBirth)}
        color={pet.color ?? null}
        distinguishingFeatures={pet.distinguishingFeatures ?? null}
        photoUrl={photoUrl}
        placeName={episode?.placeName ?? null}
        lostSince={episode?.openedAt ?? null}
        ownerFirstName={ownerFirstName}
        ownerPhone={ownerPhone}
        locationDisclosed={pet.discloseLastLocationWhenLost}
        qrSvg={qrSvg}
      />
    </div>
  );
}
