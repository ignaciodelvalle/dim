"use client";

// RehomeRequestForm — per-org "Enviar solicitud" button on the buscar-hogar page.
// Calls sendRehomeRequestAction; shows pending/sent/error states.

import { useTransition } from "react";

type Props = {
  petPublicToken: string;
  targetOrgId: string;
  orgDisplayName: string;
  fosterName: string;
};

import { useState } from "react";

export function RehomeRequestForm({ petPublicToken, targetOrgId, orgDisplayName }: Props) {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSend() {
    startTransition(async () => {
      setError(null);
      const { sendRehomeRequestAction } = await import("@/src/modules/foster/actions");
      const result = await sendRehomeRequestAction(petPublicToken, targetOrgId);
      if ("error" in result) {
        setError(result.error);
      } else {
        setSent(true);
      }
    });
  }

  if (sent) {
    return (
      <span className="text-sm text-gob-success font-medium whitespace-nowrap">
        ✓ Solicitud enviada a {orgDisplayName}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleSend}
        disabled={isPending}
        className="px-3 py-1.5 rounded-lg bg-gob-primary text-white text-sm font-medium hover:bg-gob-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {isPending ? "Enviando…" : "Enviar solicitud"}
      </button>
      {error && <p className="text-xs text-gob-error">{error}</p>}
    </div>
  );
}
