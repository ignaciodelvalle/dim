// Pet profile v2 §4.7 — Animal Potencialmente Peligroso card.
//
// Renders ABOVE the identity header when `pet.potentiallyDangerousBreed`
// is true. The status is public by law (Ley CABA 4078 — the public has
// a right to know), so the card is prominent but not alarmist.
//
// Shows the attestation state (registered or pending), the registry
// reference if known, and informative requirements (muzzle, leash,
// liability insurance, visible ID). The actual provincial registry
// export is a future integration; for now MiMAR captures the attestation
// locally.

import Link from "next/link";

import type { PetEvent } from "@/db";
import { formatDate } from "@/lib/format";

const REGISTRY_LABELS: Record<string, string> = {
  caba_4078: "Registro CABA — Ley 4078",
  prov_14107: "Registro Provincial — Ley 14.107",
  other: "Otro registro",
};

interface Props {
  petPublicToken: string;
  breed: string | null;
  events: PetEvent[];
  isTransit: boolean;
}

export function PpPCard({ petPublicToken, breed, events, isTransit }: Props) {
  const latestAttestation = events.find((e) => e.eventType === "dangerous_breed_attested");
  const payload = (latestAttestation?.payload ?? {}) as {
    registry?: string;
    registry_id?: string | null;
    attested_at?: string;
  };

  return (
    <section className="space-y-3 rounded-2xl border border-gob-warning bg-gob-warning/10 p-4  ">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gob-warning-text ">
          ⚠ Animal Potencialmente Peligroso (PPP)
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-wider text-gob-warning-text ">
          Ley CABA 4078 · Prov 14.107
        </span>
      </header>

      <p className="text-xs text-gob-warning-text ">
        {breed
          ? `Por la raza (${breed}) esta mascota está sujeta al régimen de Animales Potencialmente Peligrosos.`
          : "Esta mascota está marcada como Animal Potencialmente Peligroso."}
      </p>

      <div className="rounded-lg border border-gob-warning bg-gob-warning/10/60 p-3 text-xs  ">
        <p className="font-medium text-gob-warning-text ">Atestación</p>
        {latestAttestation ? (
          <p className="mt-1 text-gob-warning-text ">
            ✓ Atestada en{" "}
            <strong>{REGISTRY_LABELS[payload.registry ?? ""] ?? payload.registry}</strong>
            {payload.attested_at ? ` el ${formatDate(payload.attested_at)}` : ""}
            {payload.registry_id ? (
              <>
                <br />
                Nº de registro: <code className="font-mono">{payload.registry_id}</code>
              </>
            ) : null}
          </p>
        ) : (
          <div className="mt-1 space-y-2">
            <p className="text-gob-warning-text ">⚠ Atestación pendiente.</p>
            {isTransit ? (
              <p className="text-gob-warning-text ">
                La obligación legal de atestar es del dueño permanente. Como tránsito no podés
                cargar la atestación.
              </p>
            ) : (
              <Link
                href={`/mis-mascotas/${petPublicToken}/eventos/atestar-raza-peligrosa`}
                className="inline-block rounded-md bg-gob-warning px-3 py-1.5 text-xs font-medium text-white hover:bg-gob-warning  "
              >
                Registrar atestación →
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gob-warning bg-gob-warning/10/40 p-3 text-xs  ">
        <p className="font-medium text-gob-warning-text ">Requisitos generales (informativos)</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-gob-warning-text ">
          <li>Bozal y correa corta en vía pública</li>
          <li>Seguro de responsabilidad civil recomendado</li>
          <li>Identificación visible permanente</li>
        </ul>
      </div>
    </section>
  );
}
