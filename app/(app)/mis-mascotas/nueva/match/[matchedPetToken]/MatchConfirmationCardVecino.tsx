"use client";

// MatchConfirmationCardVecino — same card as refugio but wired to vecino mode.
// Extracted as a thin wrapper so the vecino page can stay a pure server component.

import { confirmChipMatchAction } from "@/app/actions/chip-match";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
};

export function MatchConfirmationCardVecino({
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
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDecision(decision: "same" | "not_same") {
    startTransition(async () => {
      setError(null);
      const result = await confirmChipMatchAction({
        matchedPetToken,
        actorMode: "vecino",
        decision,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (decision === "same") {
        // Vecino does NOT add the pet; original owner regains visibility.
        router.push("/mis-mascotas");
      } else {
        // Continue creating the pet but mark that the chip didn't match.
        router.push("/mis-mascotas/nueva?chipMismatched=true");
      }
    });
  }

  const speciesLine = [petSpecies, petBreed].filter(Boolean).join(", ");
  const details = [petColor, petSex ? sexLabel(petSex) : null].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gob-warning bg-gob-warning/10   p-4 space-y-1">
        <p className="text-sm font-semibold text-gob-warning-text ">
          Posible coincidencia detectada
        </p>
        <p className="text-sm text-gob-warning-text ">
          El microchip que ingresaste ya figura en MiMAR asociado a la siguiente mascota.
        </p>
      </div>

      <div className="rounded-xl border border-gob-border  overflow-hidden">
        {petPhotoUrl && (
          <div className="aspect-video overflow-hidden bg-gob-surface-alt ">
            <img src={petPhotoUrl} alt={petName} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-4 space-y-3">
          <div>
            <h2 className="text-2xl font-semibold">{petName}</h2>
            {speciesLine && <p className="text-sm text-gob-text-gray ">{speciesLine}</p>}
            {details && <p className="text-sm text-gob-text-muted ">{details}</p>}
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gob-danger/10 text-gob-danger  ">
            Perdida
          </span>
          {ownerFirstName && (
            <p className="text-sm">
              <span className="text-gob-text-muted">Dueno/a: </span>
              <span className="font-medium">{ownerFirstName}</span>
            </p>
          )}
          {lastLocationText && (
            <p className="text-sm">
              <span className="text-gob-text-muted">Ultima ubicacion conocida: </span>
              <span>{lastLocationText}</span>
              {lastLocationDate && (
                <span className="text-gob-text-muted ml-1">
                  ({new Date(lastLocationDate).toLocaleDateString("es-AR")})
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm rounded border border-gob-danger bg-gob-danger/10 px-3 py-2 text-gob-danger   ">
          {error}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleDecision("same")}
          className="flex-1 px-4 py-3 rounded-lg bg-gob-success text-white font-medium hover:bg-gob-success disabled:opacity-50 transition-colors"
        >
          {isPending ? "Procesando..." : "Es la misma mascota"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleDecision("not_same")}
          className="flex-1 px-4 py-3 rounded-lg border border-gob-warning bg-gob-warning/10 text-gob-warning-text font-medium hover:bg-gob-warning/10 disabled:opacity-50     transition-colors"
        >
          {isPending ? "Procesando..." : "No es la misma"}
        </button>
      </div>

      <p className="text-xs text-gob-text-muted">
        Si es la misma, no hace falta que la registres: el dueno/a ya la tiene en su cuenta y va a
        ser notificado. Si no es la misma, podes continuar con el registro de tu mascota.
      </p>
    </div>
  );
}

function sexLabel(sex: string) {
  if (sex === "male") return "Macho";
  if (sex === "female") return "Hembra";
  return null;
}
