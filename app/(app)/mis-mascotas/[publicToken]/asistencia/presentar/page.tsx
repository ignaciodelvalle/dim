// Full-screen presentation mode for the service-dog credential.
//
// Optimised for showing to a doorperson / receptionist: chrome-free,
// neutral background, large readable type, all data loaded server-side
// (works offline after the initial load).
//
// Auth: owner-only via requirePetAccess (same pattern as vacunas page).
// A non-owner visitor gets notFound() — the page is private by design.
//
// QR toggle: the QR feature requires a lightweight QR library that is NOT
// yet installed. The toggle UI is present but the QR panel renders a
// placeholder with the public URL text. Add a QR library (e.g. `qrcode`)
// and swap the placeholder for a real <QRCode> component once approved.
//
// Spec §4.8 — "Modo presentación". Pet profile v2 Slice C, Commit 4.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
  // Owner-only: fosters / co-owners / caretakers are denied. The credential
  // is legal-identity for the owner's disability accommodation — only the
  // owner should be presenting it.
  if (access.accessPath !== "owner") notFound();

  const pet = access.pet;

  const [serviceDog] = await db
    .select()
    .from(petServiceDog)
    .where(eq(petServiceDog.petId, pet.id))
    .limit(1);

  // Guard: redirect back to /asistencia when there is no presentable credential.
  if (!isCredentialPresentable(serviceDog ?? null)) {
    redirect(`/mis-mascotas/${publicToken}/asistencia`);
  }

  // Pet photo
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

  return (
    <main className="min-h-screen bg-white text-neutral-900 flex flex-col">
      {/* Minimal top bar — back link only, easy to dismiss visually */}
      <div className="px-4 pt-4">
        <Link
          href={`/mis-mascotas/${publicToken}/asistencia`}
          className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
        >
          ← Volver
        </Link>
      </div>

      {/* Presentation content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6 max-w-lg mx-auto w-full">
        {/* Credential title */}
        <div className="text-center space-y-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">
            Credencial de perro de asistencia
          </p>
          <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">
            Ley 26.858
          </p>
        </div>

        {/* Photo */}
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={pet.name}
            className="h-36 w-36 rounded-full object-cover ring-4 ring-emerald-200 shadow-md"
          />
        ) : (
          <div className="flex h-36 w-36 items-center justify-center rounded-full bg-emerald-50 text-6xl ring-4 ring-emerald-200 shadow-md">
            🦮
          </div>
        )}

        {/* Pet name and service type */}
        <div className="text-center space-y-1">
          <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">{pet.name}</h1>
          <p className="text-lg text-emerald-700">{serviceTypeLabel}</p>
        </div>

        {/* Credential fields */}
        <dl className="w-full divide-y divide-neutral-100 text-sm">
          {pet.microchipId && (
            <div className="flex justify-between py-2.5">
              <dt className="text-neutral-500">Microchip</dt>
              <dd className="font-mono text-neutral-900">{pet.microchipId}</dd>
            </div>
          )}
          {serviceDog.rupgaCredential && (
            <div className="flex justify-between py-2.5">
              <dt className="text-neutral-500">RUPGA</dt>
              <dd className="font-mono text-neutral-900">{serviceDog.rupgaCredential}</dd>
            </div>
          )}
          <div className="flex justify-between py-2.5">
            <dt className="text-neutral-500">Centro de entrenamiento</dt>
            <dd className="text-neutral-900 text-right max-w-[55%]">{serviceDog.trainingCenter}</dd>
          </div>
          {serviceDog.credentialIssueDate && (
            <div className="flex justify-between py-2.5">
              <dt className="text-neutral-500">Emitida</dt>
              <dd className="text-neutral-900">{formatDate(serviceDog.credentialIssueDate)}</dd>
            </div>
          )}
          {serviceDog.credentialExpiryDate && (
            <div className="flex justify-between py-2.5">
              <dt className="text-neutral-500">Vence</dt>
              <dd className="text-neutral-900">{formatDate(serviceDog.credentialExpiryDate)}</dd>
            </div>
          )}
        </dl>

        {/* Legal text */}
        <p className="text-xs text-center text-neutral-500 leading-relaxed max-w-sm">
          Esta credencial habilita el acceso, deambulación y permanencia con este perro en todos los
          espacios públicos y privados de uso público (Arts. 1 y 7, Ley 26.858).
        </p>

        {/* QR toggle — QR library not yet installed; shows URL text as stub */}
        <QrToggle publicVerifyUrl={publicVerifyUrl} />
      </div>
    </main>
  );
}

// QR toggle uses <details>/<summary> — native HTML disclosure widget that works
// without JS. When a QR library is approved and installed, replace the URL text
// stub with a real <QRCode value={publicVerifyUrl} /> component.
function QrToggle({ publicVerifyUrl }: { publicVerifyUrl: string }) {
  return (
    <details className="w-full text-center">
      <summary className="cursor-pointer text-xs text-emerald-600 hover:text-emerald-800 select-none">
        Mostrar QR de verificación
      </summary>
      <div className="mt-3 flex flex-col items-center gap-2">
        <p className="text-[10px] text-neutral-400">
          QR no disponible — se requiere aprobación de dependencia.
        </p>
        <p className="font-mono text-xs text-neutral-600 break-all max-w-xs">{publicVerifyUrl}</p>
      </div>
    </details>
  );
}
