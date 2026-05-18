"use client";

// MatchConfirmationCard — presented to the actor (refugio or vecino) when a
// microchip cross-check detected a possible match during intake.
//
// Shows the matched pet's public-facing data and offers two actions:
//   "Es la misma mascota" → confirmChipMatchAction(decision='same')
//   "No es la misma"     → confirmChipMatchAction(decision='not_same')

import { confirmChipMatchAction } from "@/app/actions/chip-match";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useState } from "react";

type Props = {
  matchedPetToken: string;
  petName: string;
  petSpecies: string | null;
  petBreed: string | null;
  petColor: string | null;
  petSex: string | null;
  petPhotoUrl: string | null;
  ownerFirstName: string | null;
  lastLocationText: string | null;
  lastLocationDate: string | null;
  // Routing after decision
  actorMode: "refugio" | "vecino";
  orgToken?: string; // required when actorMode='refugio'
  // Where to go after confirmation
  successRedirect: string;
  cancelRedirect: string;
};

export function MatchConfirmationCard({
  matchedPetToken,
  petName,
  petSpecies,
  petBreed,
  petColor,
  petSex,
  petPhotoUrl,
  ownerFirstName,
  lastLocationText,
  lastLocationDate,
  actorMode,
  orgToken,
  successRedirect,
  cancelRedirect,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDecision(decision: "same" | "not_same") {
    startTransition(async () => {
      setError(null);
      const result = await confirmChipMatchAction({
        matchedPetToken,
        actorMode,
        orgToken,
        decision,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(decision === "same" ? successRedirect : cancelRedirect);
    });
  }

  const speciesLine = [petSpecies, petBreed].filter(Boolean).join(", ");
  const details = [petColor, petSex ? sexLabel(petSex) : null].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-4 space-y-1">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Posible coincidencia detectada
        </p>
        <p className="text-sm text-amber-700 dark:text-amber-400">
          El microchip ya figura en MiMAR asociado a la siguiente mascota.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        {petPhotoUrl && (
          <div className="aspect-video overflow-hidden bg-neutral-100 dark:bg-neutral-900">
            <img src={petPhotoUrl} alt={petName} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="p-4 space-y-3">
          <div>
            <h2 className="text-2xl font-semibold">{petName}</h2>
            {speciesLine && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{speciesLine}</p>
            )}
            {details && <p className="text-sm text-neutral-500 dark:text-neutral-500">{details}</p>}
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
              Perdida
            </span>
          </div>

          {ownerFirstName && (
            <p className="text-sm">
              <span className="text-neutral-500">Dueno/a: </span>
              <span className="font-medium">{ownerFirstName}</span>
            </p>
          )}

          {lastLocationText && (
            <p className="text-sm">
              <span className="text-neutral-500">Ultima ubicacion conocida: </span>
              <span>{lastLocationText}</span>
              {lastLocationDate && (
                <span className="text-neutral-400 ml-1">
                  ({new Date(lastLocationDate).toLocaleDateString("es-AR")})
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleDecision("same")}
          className="flex-1 px-4 py-3 rounded-lg bg-green-700 text-white font-medium hover:bg-green-800 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Procesando..." : "Es la misma mascota"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleDecision("not_same")}
          className="flex-1 px-4 py-3 rounded-lg border border-amber-400 bg-amber-50 text-amber-900 font-medium hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-950/40 transition-colors"
        >
          {isPending ? "Procesando..." : "No es la misma"}
        </button>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-500">
        Si es la misma mascota, se notificara al dueno/a para coordinar la devolucion. Si no es la
        misma, esta accion queda registrada y podes continuar el ingreso normalmente.
      </p>
    </div>
  );
}

// Helper: simple sex label without importing the full format module on the client
function sexLabel(sex: string) {
  if (sex === "male") return "Macho";
  if (sex === "female") return "Hembra";
  return null;
}
