"use client";

// ConvertFosterButton — "Convertir en mi mascota" CTA from TransitBanner.
// Shows a confirm dialog before calling convertFosterToOwnerAction.
// On success, hard-navigates to the pet profile (now owned).

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  petPublicToken: string;
  petName: string;
};

export function ConvertFosterButton({ petPublicToken, petName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    startTransition(async () => {
      setError(null);
      const { convertFosterToOwnerAction } = await import("@/src/modules/foster/actions");
      const result = await convertFosterToOwnerAction(petPublicToken);
      if ("error" in result) {
        setError(result.error);
        setConfirming(false);
      } else {
        router.push(result.redirectPath);
        router.refresh();
      }
    });
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[var(--color-ln-warn)]">
          ¿Confirmar? Esto convierte el tránsito de <strong>{petName}</strong> en adopción
          permanente. No se puede deshacer.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="px-3 py-1.5 rounded-[3px] bg-[var(--color-ln-azul)] text-white text-sm font-medium hover:bg-[var(--color-ln-azul-700)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? "Procesando…" : "Sí, adoptar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="px-3 py-1.5 rounded-[3px] border border-[var(--color-ln-warn)] text-sm text-[var(--color-ln-warn)] hover:opacity-80 transition-colors disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-[var(--color-ln-err)]">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="px-3 py-1.5 rounded-[3px] border border-[var(--color-ln-warn)] text-sm text-[var(--color-ln-warn)] hover:opacity-80 transition-colors"
    >
      Convertir en mi mascota
    </button>
  );
}
