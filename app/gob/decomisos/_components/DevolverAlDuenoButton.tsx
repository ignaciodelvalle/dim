"use client";

// DevolverAlDuenoButton -- triggers returnCustodyToOwnerAction for a
// custody_episode still in the OPENING govt org's direct custody.
//
// This is the terminal path that closes the episode by returning the
// animal to its immediate former owner (reactivating their SAME ownership
// row, "nunca se le fue") rather than handing off to a refugio. It restores
// the former owner's FULL access to the pet, so it requires an explicit
// confirmation before firing.

import { useState, useTransition } from "react";

import { returnCustodyToOwnerAction } from "@/app/actions/decomiso";
import { OpButton } from "@/components/ui/dashboard";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";

type DevolverAlDuenoButtonProps = {
  casePublicCode: string;
};

export function DevolverAlDuenoButton({ casePublicCode }: DevolverAlDuenoButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await returnCustodyToOwnerAction({ casePublicCode });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      // Full document reload so the SSR page reflects the mutation
      // (router.refresh() is banned - see lib/ui/full-page-action-nav.ts).
      navigateAfterActionSuccess(window.location.href);
    });
  }

  if (!open) {
    return (
      <OpButton type="button" onClick={() => setOpen(true)} variant="ghost" size="sm">
        Devolver al dueño
      </OpButton>
    );
  }

  return (
    <dialog
      open
      className="fixed inset-0 z-50 flex items-center justify-center p-4 m-0 w-full h-full max-w-none max-h-none bg-transparent border-none"
      aria-label={`Devolver al dueño — ${casePublicCode}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ln-op-ink/40"
        onClick={() => !isPending && setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && !isPending && setOpen(false)}
      />
      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-[var(--radius-lg)] bg-ln-op-card border border-ln-op-line shadow-xl p-6 space-y-4">
        <h3 className="text-[15px] font-semibold text-ln-op-ink">
          Devolver al dueño — {casePublicCode}
        </h3>
        <p className="text-[13px] text-ln-op-mute">
          Esto cierra el episodio de custodia y le restituye al dueño anterior el acceso completo
          sobre la mascota — una transferencia real de responsabilidad legal. Esta acción no se
          puede deshacer.
        </p>

        {error && (
          <p className="text-[13px] text-ln-op-danger rounded-[var(--radius-md)] bg-ln-op-danger-bg border border-ln-op-danger-bd px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <OpButton
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            variant="primary"
            block
            className="py-2.5"
          >
            {isPending ? "Devolviendo..." : "Confirmar devolución"}
          </OpButton>
          <OpButton
            type="button"
            onClick={() => setOpen(false)}
            disabled={isPending}
            variant="ghost"
            block
            className="py-2.5"
          >
            Cancelar
          </OpButton>
        </div>
      </div>
    </dialog>
  );
}
