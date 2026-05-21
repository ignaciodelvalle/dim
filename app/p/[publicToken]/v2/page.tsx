// Preview of the public credential page when the pet is in lost mode.
//
// Reach via /p/{token}/v2. This is what a stranger sees when they scan
// the QR while the pet's status is "lost". The live /p/{token}/page.tsx
// already has a lost branch; this preview makes the new layout
// reviewable in isolation.
//
// No auth — the public credential is intentionally open. Disclosure
// prefs on `pets` decide which fields are passed in.

import { LostPublicCredential } from "@/components/pet-profile/LostPublicCredential";

export const dynamic = "force-dynamic";

export default async function PublicLostV2Page({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  // Hardcoded for the preview. Real wiring resolves the pet by
  // publicToken, applies pets.disclose_*_when_lost to filter the
  // displayed fields, and renders this layout when pets.status==='lost'.
  return (
    <LostPublicCredential
      petName="Roma"
      petPhotoUrl={null}
      identityLine="Canino · marrón · collar rojo"
      ownerFirstName="Ignacio"
      ownerPhoneE164="+541145678910"
      lastSeenPlaceName="Plaza Italia"
      lastSeenLocality="La Plata"
      distinguishingFeatures="Responde a su nombre, es muy sociable, tiene una mancha blanca en el pecho."
      finderFormHref={`/p/${publicToken}/encontre`}
      lostSince={new Date(Date.now() - 3 * 60 * 60 * 1000 - 42 * 60 * 1000)}
    />
  );
}
