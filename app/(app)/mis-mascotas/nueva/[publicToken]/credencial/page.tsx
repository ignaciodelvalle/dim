// /mis-mascotas/nueva/[publicToken]/credencial — onboarding aha moment.
//
// Shown immediately after a new pet is registered. Delivers the core aha:
// "your pet now has a verifiable digital credential" via QR display + share.
//
// Server component: fetches pet data + generates QR SVG, then delegates all
// interactivity to the PetCreatedAha client component.
//
// Edge cases handled:
//   - No photo: renders with placeholder, does not block.
//   - intent=apply / returnTo: createPetAction skips this page; this page is
//     never shown to adoption-intent users (see actions.ts).
//   - Not owner: notFound() via requirePetAccess.

import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { requirePetAccess } from "@/lib/infra/pet-access";
import { PetCreatedAha } from "./PetCreatedAha";

export default async function PetCreatedCredentialPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  const { pet, accessPath } = access;

  // Guard: only the pet owner should reach this onboarding page.
  if (accessPath !== "owner") notFound();

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mimar.ar";
  const credentialUrl = `${baseUrl}/p/${publicToken}`;

  // Generate QR as inline SVG — avoids needing a separate image route.
  // size=240 satisfies the spec ≥200px requirement.
  const qrSvg = await QRCode.toString(credentialUrl, {
    type: "svg",
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
  });

  return (
    <PetCreatedAha
      petName={pet.name}
      publicToken={publicToken}
      credentialUrl={credentialUrl}
      qrSvg={qrSvg}
    />
  );
}
