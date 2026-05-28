"use client";

// Shared view for the Tier 2 público temporal toggle.
// Rendered both by the /mostrar-libreta deep-link page and the
// ?sheet=mostrar-tier2 sheet in SheetMounter.
//
// The page wraps this in a <main> with a back-link; the sheet just
// renders it directly inside the Sheet chrome.

import Link from "next/link";

const DURATION_CARDS: ReadonlyArray<{
  id: "24h" | "7d" | "30d" | "siempre";
  title: string;
  description: string;
  enabled: boolean;
}> = [
  {
    id: "24h",
    title: "24 horas (recomendado)",
    description: "Para una visita al vet o un viaje corto.",
    enabled: true,
  },
  {
    id: "7d",
    title: "7 días",
    description: "Tránsito, cuidador temporal, escapadas de fin de semana.",
    enabled: false,
  },
  {
    id: "30d",
    title: "30 días",
    description: "Internación, viaje largo, mudanza.",
    enabled: false,
  },
  {
    id: "siempre",
    title: "Siempre visible",
    description: "Útil para mascotas con condiciones crónicas. Podés revertirlo cuando quieras.",
    enabled: false,
  },
];

type Props = {
  petPublicToken: string;
  petName: string;
  isActive: boolean;
  activeUntil: Date | null;
  enableAction: () => Promise<void>;
  revokeAction: () => Promise<void>;
};

export function Tier2PublicView({
  petPublicToken,
  isActive,
  activeUntil,
  enableAction,
  revokeAction,
}: Props) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gob-text-gray ">
        Habilitá temporalmente el Tier 2 de la credencial pública —{" "}
        <strong>sólo la información médicamente relevante</strong>.
      </p>

      <div className="rounded-xl border border-gob-border  bg-gob-surface-alt/60  p-4 text-xs leading-relaxed text-gob-text-gray ">
        Al escanear el QR de la chapita, hoy se ve solo identidad básica (Tier 0). Con esta acción,
        durante el lapso elegido se muestra también vacunas vigentes, antiparasitario reciente,
        esterilización, condiciones permanentes y medicación activa.{" "}
        <strong className="text-gob-text ">
          No se expone tu contacto, dirección, DNI ni notas privadas.
        </strong>
      </div>

      {isActive && activeUntil ? (
        <ActiveStatusCard
          until={activeUntil}
          petPublicToken={petPublicToken}
          revokeAction={revokeAction}
        />
      ) : (
        <EnableForm enableAction={enableAction} />
      )}
    </div>
  );
}

function EnableForm({ enableAction }: { enableAction: () => Promise<void> }) {
  return (
    <form action={enableAction} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-xs uppercase tracking-wider font-semibold text-gob-text-muted  mb-1.5">
          Duración
        </legend>
        {DURATION_CARDS.map((card, idx) => {
          const isPrimary = idx === 0 && card.enabled;
          return (
            <label
              key={card.id}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                card.enabled
                  ? "cursor-pointer border-gob-border-strong  has-[:checked]:border-gob-success has-[:checked]:bg-gob-success/10  "
                  : "border-dashed border-gob-border  bg-gob-surface-alt/40  opacity-60 cursor-not-allowed"
              }`}
              title={card.enabled ? undefined : "Próximamente"}
            >
              <input
                type="radio"
                name="duration"
                value={card.id}
                defaultChecked={isPrimary}
                disabled={!card.enabled}
                className="mt-0.5 h-4 w-4"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gob-text ">{card.title}</span>
                  {!card.enabled && (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-gob-text-muted  px-1.5 py-0.5 rounded-full border border-gob-border-strong ">
                      Próximamente
                    </span>
                  )}
                </div>
                <p className="text-xs text-gob-text-gray ">{card.description}</p>
              </div>
            </label>
          );
        })}
      </fieldset>

      <button
        type="submit"
        className="w-full px-4 py-3 rounded-lg bg-gob-success hover:bg-gob-success text-white font-medium"
      >
        Habilitar Tier 2 por 24 horas
      </button>

      <p className="text-xs text-gob-text-muted  text-center">
        Vas a poder revocarlo en cualquier momento desde acá.
      </p>
    </form>
  );
}

function ActiveStatusCard({
  until,
  petPublicToken,
  revokeAction,
}: {
  until: Date;
  petPublicToken: string;
  revokeAction: () => Promise<void>;
}) {
  const fmt = until.toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="rounded-xl border border-gob-success bg-gob-success/10/70   p-4 space-y-3">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider font-semibold text-gob-success ">
          Tier 2 activo
        </p>
        <p className="text-sm font-medium text-gob-text ">
          Hasta el <strong>{fmt}</strong>
        </p>
        <p className="text-xs text-gob-text-gray ">
          Quien escanee el QR ve identidad básica + vacunas vigentes, antiparasitario reciente,
          esterilización, condiciones permanentes y medicación activa.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Link
          href={`/p/${petPublicToken}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1 text-center px-4 py-2 rounded-lg border border-gob-success text-gob-success   text-sm font-medium hover:bg-gob-success/10/50 "
        >
          Ver la credencial pública →
        </Link>
        <form action={revokeAction} className="flex-1">
          <button
            type="submit"
            className="w-full px-4 py-2 rounded-lg bg-gob-primary  text-white  text-sm font-medium hover:bg-gob-primary "
          >
            Revocar ahora
          </button>
        </form>
      </div>
    </div>
  );
}
