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
import { SERVICE_TYPE_LABELS, buildPresentarHref } from "@/lib/infra/service-dog-labels";
import { formatDate } from "@/lib/utils/format";

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
    <section className="overflow-hidden rounded-2xl border border-ln-ok bg-ln-card shadow-sm  ">
      <header className="flex items-baseline justify-between gap-3 bg-ln-ok px-4 py-2 text-white ">
        <h2 className="text-xs font-semibold uppercase tracking-wider">
          Credencial de perro de asistencia
        </h2>
        <span className="text-xs font-medium uppercase tracking-wider">Ley 26.858</span>
      </header>

      <div className="flex items-start gap-4 p-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={petName}
            className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-ln-ok "
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[var(--color-ln-ok-050)] text-3xl ">
            🦮
          </div>
        )}
        <dl className="flex-1 space-y-0.5 text-xs">
          <dt className="sr-only">Nombre</dt>
          <dd className="text-base font-semibold text-ln-ink ">{petName}</dd>
          <dt className="sr-only">Tipo</dt>
          <dd className="text-sm text-ln-ok ">
            {SERVICE_TYPE_LABELS[serviceDog.serviceType] ?? serviceDog.serviceType}
          </dd>
          {microchipId ? (
            <>
              <dt className="mt-2 text-ln-mute ">Microchip</dt>
              <dd className="font-mono text-ln-ink-2 ">{microchipId}</dd>
            </>
          ) : null}
          {serviceDog.rupgaCredential ? (
            <>
              <dt className="mt-1 text-ln-mute ">RUPGA</dt>
              <dd className="font-mono text-ln-ink-2 ">{serviceDog.rupgaCredential}</dd>
            </>
          ) : null}
          <dt className="mt-1 text-ln-mute ">Centro de entrenamiento</dt>
          <dd className="text-ln-ink-2 ">{serviceDog.trainingCenter}</dd>
          {serviceDog.credentialIssueDate ? (
            <>
              <dt className="mt-1 text-ln-mute ">Emitida</dt>
              <dd className="text-ln-ink-2 ">{formatDate(serviceDog.credentialIssueDate)}</dd>
            </>
          ) : null}
          {serviceDog.credentialExpiryDate ? (
            <>
              <dt className="mt-1 text-ln-mute ">Vence</dt>
              <dd className="text-ln-ink-2 ">
                {formatDate(serviceDog.credentialExpiryDate)}
                {expiringSoon ? (
                  <span className="ml-2 inline-flex items-center rounded-full bg-[var(--color-ln-warn-050)] px-2 py-0.5 text-xs font-medium text-ln-warn  ">
                    Renovar pronto
                  </span>
                ) : null}
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      <div className="border-t border-ln-ok bg-[var(--color-ln-ok-050)] px-4 py-3 text-[11px] text-ln-ok   ">
        Esta credencial habilita el acceso, deambulación y permanencia de la mascota en todos los
        espacios públicos y privados de uso público, conforme a la Ley 26.858.
      </div>

      <div className="border-t border-ln-ok px-4 py-2 ">
        <Link
          href={`/mis-mascotas/${petPublicToken}/asistencia`}
          className="text-xs font-medium text-ln-ok hover:text-ln-ok/80  "
        >
          Gestionar credencial →
        </Link>
      </div>

      <div className="border-t border-ln-ok px-4 py-2 ">
        <Link
          href={buildPresentarHref(petPublicToken)}
          className="text-xs font-medium text-ln-ok hover:text-ln-ok/80  "
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
