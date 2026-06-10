// Modo presentación — credencial de perro de asistencia.
// Libreta Nacional redesign. Full-screen chrome-free layout preserved.
// gob-* token references replaced with LN semantic tokens.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";

import { attachments, db, petServiceDog } from "@/db";
import { formatDate } from "@/lib/format";
import { requirePetAccess } from "@/lib/pet-access";
import { SERVICE_TYPE_LABELS } from "@/lib/service-dog-labels";
import { buildPublicVerifyUrl, isCredentialPresentable } from "@/lib/service-dog-presentar";
import { petPhotoUrl } from "@/lib/storage";
import { and, eq } from "drizzle-orm";

export default async function AsistenciaPresentarPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  if (access.accessPath !== "owner") notFound();

  const pet = access.pet;

  const [serviceDog] = await db
    .select()
    .from(petServiceDog)
    .where(eq(petServiceDog.petId, pet.id))
    .limit(1);

  if (!isCredentialPresentable(serviceDog ?? null)) {
    redirect(`/mis-mascotas/${publicToken}/asistencia`);
  }

  const [photoAttachment] = pet.primaryPhotoId
    ? await db
        .select({ storagePath: attachments.storagePath })
        .from(attachments)
        .where(and(eq(attachments.id, pet.primaryPhotoId)))
        .limit(1)
    : [];
  const photoUrl = petPhotoUrl(photoAttachment?.storagePath);

  const serviceTypeLabel = SERVICE_TYPE_LABELS[serviceDog.serviceType] ?? serviceDog.serviceType;

  const publicVerifyUrl = buildPublicVerifyUrl(publicToken);
  const qrSvg = await QRCode.toString(publicVerifyUrl, {
    type: "svg",
    margin: 1,
    width: 180,
    errorCorrectionLevel: "M",
  });

  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-ln-canvas)] text-[var(--color-ln-ink)]">
      {/* Minimal top bar */}
      <div className="px-[16px] pt-[16px]">
        <Link
          href={`/mis-mascotas/${publicToken}/asistencia`}
          className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)] no-underline hover:text-[var(--color-ln-ink-2)]"
        >
          ← Volver
        </Link>
      </div>

      {/* Presentation content */}
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-[24px] px-[24px] py-[32px]">
        {/* Credential title */}
        <div className="text-center">
          <p className="font-[var(--font-ln-mono)] text-[10px] uppercase tracking-[.3em] text-[var(--color-ln-mute)]">
            Credencial de perro de asistencia
          </p>
          <p className="mt-[3px] font-[var(--font-ln-mono)] text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-ok)]">
            Ley 26.858
          </p>
        </div>

        {/* Photo */}
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={pet.name}
            className="h-[144px] w-[144px] rounded-full object-cover shadow-md ring-4 ring-[var(--color-ln-ok)]"
          />
        ) : (
          <div className="flex h-[144px] w-[144px] items-center justify-center rounded-full bg-[var(--color-ln-ok-050)] text-6xl shadow-md ring-4 ring-[var(--color-ln-ok)]">
            🦮
          </div>
        )}

        {/* Pet name and service type */}
        <div className="text-center">
          <h1 className="font-[var(--font-ln-serif)] text-[40px] font-semibold tracking-tight text-[var(--color-ln-ink)]">
            {pet.name}
          </h1>
          <p className="mt-[4px] text-[18px] text-[var(--color-ln-ok)]">{serviceTypeLabel}</p>
        </div>

        {/* Credential fields */}
        <dl className="w-full divide-y divide-[var(--color-ln-line)]">
          {pet.microchipId && (
            <div className="flex justify-between py-[10px]">
              <dt className="text-[13px] text-[var(--color-ln-mute)]">Microchip</dt>
              <dd className="font-[var(--font-ln-mono)] text-[13px] text-[var(--color-ln-ink)]">
                {pet.microchipId}
              </dd>
            </div>
          )}
          {serviceDog.rupgaCredential && (
            <div className="flex justify-between py-[10px]">
              <dt className="text-[13px] text-[var(--color-ln-mute)]">RUPGA</dt>
              <dd className="font-[var(--font-ln-mono)] text-[13px] text-[var(--color-ln-ink)]">
                {serviceDog.rupgaCredential}
              </dd>
            </div>
          )}
          <div className="flex justify-between py-[10px]">
            <dt className="text-[13px] text-[var(--color-ln-mute)]">Centro de entrenamiento</dt>
            <dd className="max-w-[55%] text-right text-[13px] text-[var(--color-ln-ink)]">
              {serviceDog.trainingCenter}
            </dd>
          </div>
          {serviceDog.credentialIssueDate && (
            <div className="flex justify-between py-[10px]">
              <dt className="text-[13px] text-[var(--color-ln-mute)]">Emitida</dt>
              <dd className="text-[13px] text-[var(--color-ln-ink)]">
                {formatDate(serviceDog.credentialIssueDate)}
              </dd>
            </div>
          )}
          {serviceDog.credentialExpiryDate && (
            <div className="flex justify-between py-[10px]">
              <dt className="text-[13px] text-[var(--color-ln-mute)]">Vence</dt>
              <dd className="text-[13px] text-[var(--color-ln-ink)]">
                {formatDate(serviceDog.credentialExpiryDate)}
              </dd>
            </div>
          )}
        </dl>

        {/* Legal text */}
        <p className="max-w-sm text-center text-[12px] leading-relaxed text-[var(--color-ln-mute)]">
          Esta credencial habilita el acceso, deambulación y permanencia con este perro en todos los
          espacios públicos y privados de uso público (Arts. 1 y 7, Ley 26.858).
        </p>

        {/* QR toggle — server-rendered SVG, native disclosure */}
        <details className="w-full text-center">
          <summary className="cursor-pointer font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)] select-none hover:underline">
            Mostrar QR de verificación
          </summary>
          <div className="mt-[12px] flex flex-col items-center gap-[8px]">
            <div
              className="rounded-[4px] bg-white p-[8px] shadow-sm"
              aria-label={`QR de verificación para ${publicVerifyUrl}`}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: server-generated SVG from the qrcode library
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="max-w-xs break-all font-[var(--font-ln-mono)] text-[10px] text-[var(--color-ln-mute)]">
              {publicVerifyUrl}
            </p>
          </div>
        </details>
      </div>
    </main>
  );
}
