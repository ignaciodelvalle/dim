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
import { resolvePhysicalCredentialChannels } from "@/lib/infra/physical-credential-channels";
import { resolveSiteUrl } from "@/lib/infra/site-url";
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

  const baseUrl = resolveSiteUrl();
  const credentialUrl = `${baseUrl}/p/${publicToken}`;

  // Generate QR as inline SVG — avoids needing a separate image route.
  // size=240 satisfies the spec ≥200px requirement.
  //
  // The channel resolve is the SAME gate /chapita applies to itself
  // (resolvePhysicalCredentialChannels, cascading locality > province >
  // country > default). Resolving it here is what lets this screen offer the
  // print link without bypassing the jurisdiction's decision: with the channel
  // off the link is not rendered, instead of landing the owner on /chapita's
  // "no está habilitado en tu zona" notice. Cost is up to 3 indexed lookups on
  // govt_business_rules, on a page that renders once per pet registration.
  const [qrSvg, channels] = await Promise.all([
    QRCode.toString(credentialUrl, {
      type: "svg",
      margin: 1,
      width: 240,
      errorCorrectionLevel: "M",
    }),
    resolvePhysicalCredentialChannels({
      country: "AR",
      province: pet.jurisdictionProvince,
      locality: pet.jurisdictionLocality,
    }),
  ]);

  return (
    <PetCreatedAha
      petName={pet.name}
      publicToken={publicToken}
      credentialUrl={credentialUrl}
      qrSvg={qrSvg}
      printableQrEnabled={channels.printable_qr}
    />
  );
}
