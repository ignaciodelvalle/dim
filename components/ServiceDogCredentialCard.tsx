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
    <section className="overflow-hidden rounded-2xl border border-emerald-300 bg-white shadow-sm dark:border-emerald-700 dark:bg-neutral-900">
      <header className="flex items-baseline justify-between gap-3 bg-emerald-600 px-4 py-2 text-white dark:bg-emerald-800">
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
            className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-emerald-100 dark:ring-emerald-900"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-3xl dark:bg-emerald-950">
            🦮
          </div>
        )}
        <dl className="flex-1 space-y-0.5 text-xs">
          <dt className="sr-only">Nombre</dt>
          <dd className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            {petName}
          </dd>
          <dt className="sr-only">Tipo</dt>
          <dd className="text-sm text-emerald-800 dark:text-emerald-200">
            {SERVICE_TYPE_LABELS[serviceDog.serviceType] ?? serviceDog.serviceType}
          </dd>
          {microchipId ? (
            <>
              <dt className="mt-2 text-neutral-500 dark:text-neutral-400">Microchip</dt>
              <dd className="font-mono text-neutral-700 dark:text-neutral-300">{microchipId}</dd>
            </>
          ) : null}
          {serviceDog.rupgaCredential ? (
            <>
              <dt className="mt-1 text-neutral-500 dark:text-neutral-400">RUPGA</dt>
              <dd className="font-mono text-neutral-700 dark:text-neutral-300">
                {serviceDog.rupgaCredential}
              </dd>
            </>
          ) : null}
          <dt className="mt-1 text-neutral-500 dark:text-neutral-400">Centro de entrenamiento</dt>
          <dd className="text-neutral-700 dark:text-neutral-300">{serviceDog.trainingCenter}</dd>
          {serviceDog.credentialIssueDate ? (
            <>
              <dt className="mt-1 text-neutral-500 dark:text-neutral-400">Emitida</dt>
              <dd className="text-neutral-700 dark:text-neutral-300">
                {formatDate(serviceDog.credentialIssueDate)}
              </dd>
            </>
          ) : null}
          {serviceDog.credentialExpiryDate ? (
            <>
              <dt className="mt-1 text-neutral-500 dark:text-neutral-400">Vence</dt>
              <dd className="text-neutral-700 dark:text-neutral-300">
                {formatDate(serviceDog.credentialExpiryDate)}
                {expiringSoon ? (
                  <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                    Renovar pronto
                  </span>
                ) : null}
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      <div className="border-t border-emerald-100 bg-emerald-50/60 px-4 py-3 text-[11px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
        Esta credencial habilita el acceso, deambulación y permanencia de la mascota en todos los
        espacios públicos y privados de uso público, conforme a la Ley 26.858.
      </div>

      <div className="border-t border-emerald-100 px-4 py-2 dark:border-emerald-900">
        <Link
          href={`/mis-mascotas/${petPublicToken}/asistencia`}
          className="text-xs font-medium text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100"
        >
          Gestionar credencial →
        </Link>
      </div>

      <div className="border-t border-emerald-100 px-4 py-2 dark:border-emerald-900">
        <Link
          href={buildPresentarHref(petPublicToken)}
          className="text-xs font-medium text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100"
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
