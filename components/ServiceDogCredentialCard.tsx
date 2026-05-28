// Pet profile v2 §4.8 — Service dog credential card (Ley 26.858).
//
// Renders ONLY when the pet has a vigente service-dog row AND
// inService=true. The card is owner-visible by default; whether it
// also surfaces on the public credential `/p/[publicToken]` is
// controlled by `publicVisibility` (Ley 25.326 — disability is
// sensitive, default to private_only).
//
// Disability information is NEVER shown. The card lists the dog's
// service_type + training + compliance — the credential is about the
// dog, not the human. Per Ley 25.326 Art. 7.

import Link from "next/link";

import type { PetServiceDog } from "@/db";
import { formatDate } from "@/lib/format";
import { SERVICE_TYPE_LABELS, buildPresentarHref } from "@/lib/service-dog-labels";

interface Props {
  petPublicToken: string;
  petName: string;
  microchipId: string | null;
  serviceDog: PetServiceDog;
  photoUrl: string | null;
}

export function ServiceDogCredentialCard({
  petPublicToken,
  petName,
  microchipId,
  serviceDog,
  photoUrl,
}: Props) {
  const expiringSoon = isExpiringWithin(serviceDog.credentialExpiryDate, 30);

  return (
    <section className="overflow-hidden rounded-2xl border border-gob-success bg-white shadow-sm  ">
      <header className="flex items-baseline justify-between gap-3 bg-gob-success px-4 py-2 text-white ">
        <h2 className="text-xs font-semibold uppercase tracking-wider">
          Credencial de perro de asistencia
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-wider">Ley 26.858</span>
      </header>

      <div className="flex items-start gap-4 p-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={petName}
            className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-gob-success "
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gob-success/10 text-3xl ">
            🦮
          </div>
        )}
        <dl className="flex-1 space-y-0.5 text-xs">
          <dt className="sr-only">Nombre</dt>
          <dd className="text-base font-semibold text-gob-text ">{petName}</dd>
          <dt className="sr-only">Tipo</dt>
          <dd className="text-sm text-gob-success ">
            {SERVICE_TYPE_LABELS[serviceDog.serviceType] ?? serviceDog.serviceType}
          </dd>
          {microchipId ? (
            <>
              <dt className="mt-2 text-gob-text-muted ">Microchip</dt>
              <dd className="font-mono text-gob-text-gray ">{microchipId}</dd>
            </>
          ) : null}
          {serviceDog.rupgaCredential ? (
            <>
              <dt className="mt-1 text-gob-text-muted ">RUPGA</dt>
              <dd className="font-mono text-gob-text-gray ">{serviceDog.rupgaCredential}</dd>
            </>
          ) : null}
          <dt className="mt-1 text-gob-text-muted ">Centro de entrenamiento</dt>
          <dd className="text-gob-text-gray ">{serviceDog.trainingCenter}</dd>
          {serviceDog.credentialIssueDate ? (
            <>
              <dt className="mt-1 text-gob-text-muted ">Emitida</dt>
              <dd className="text-gob-text-gray ">{formatDate(serviceDog.credentialIssueDate)}</dd>
            </>
          ) : null}
          {serviceDog.credentialExpiryDate ? (
            <>
              <dt className="mt-1 text-gob-text-muted ">Vence</dt>
              <dd className="text-gob-text-gray ">
                {formatDate(serviceDog.credentialExpiryDate)}
                {expiringSoon ? (
                  <span className="ml-2 inline-flex items-center rounded-full bg-gob-warning/10 px-2 py-0.5 text-[10px] font-medium text-gob-warning-text  ">
                    Renovar pronto
                  </span>
                ) : null}
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      <div className="border-t border-gob-success bg-gob-success/10/60 px-4 py-3 text-[11px] text-gob-success   ">
        Esta credencial habilita el acceso, deambulación y permanencia de la mascota en todos los
        espacios públicos y privados de uso público, conforme a la Ley 26.858.
      </div>

      <div className="border-t border-gob-success px-4 py-2 ">
        <Link
          href={`/mis-mascotas/${petPublicToken}/asistencia`}
          className="text-xs font-medium text-gob-success hover:text-gob-success  "
        >
          Gestionar credencial →
        </Link>
      </div>

      <div className="border-t border-gob-success px-4 py-2 ">
        <Link
          href={buildPresentarHref(petPublicToken)}
          className="text-xs font-medium text-gob-success hover:text-gob-success  "
        >
          Presentar credencial →
        </Link>
      </div>
    </section>
  );
}

function isExpiringWithin(expiryDate: string | null, days: number): boolean {
  if (!expiryDate) return false;
  const expiry = new Date(expiryDate);
  if (!Number.isFinite(expiry.getTime())) return false;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + days);
  return expiry <= threshold && expiry >= new Date();
}
