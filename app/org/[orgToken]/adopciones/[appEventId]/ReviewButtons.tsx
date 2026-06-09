"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  approveAdoptionApplicationAction,
  rejectAdoptionApplicationAction,
} from "@/src/modules/adoption/actions";

export function ReviewButtons({
  orgToken,
  applicationEventId,
  applicantName,
}: {
  orgToken: string;
  applicationEventId: string;
  applicantName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);

  function confirm() {
    if (!mode) return;
    setError(null);
    const action =
      mode === "approve" ? approveAdoptionApplicationAction : rejectAdoptionApplicationAction;
    startTransition(async () => {
      const result = await action(orgToken, {
        applicationEventId,
        notes: notes.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/org/${orgToken}/adopciones`);
    });
  }

  if (mode === null) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("approve")}
          className="px-4 py-2 rounded-[6px] bg-ln-op-ok text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
        >
          Aprobar postulación
        </button>
        <button
          type="button"
          onClick={() => setMode("reject")}
          className="px-4 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
        >
          No avanzar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[6px] border border-ln-op-line bg-ln-op-card p-4">
      <p className="text-[13px] font-medium text-ln-op-ink">
        {mode === "approve"
          ? `Aprobar la postulación de ${applicantName}.`
          : `No avanzar con la postulación de ${applicantName}.`}
      </p>
      <p className="text-[12px] text-ln-op-mute">
        {mode === "approve"
          ? "El postulante recibe una notificación y un mail. La adopción se concreta cuando finalices en su ficha."
          : "El postulante recibe una notificación. Las notas son opcionales."}
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder={mode === "approve" ? "Notas internas (opcional)" : "Motivo (opcional)"}
        className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
      />
      {error && <output className="block text-[12px] text-ln-op-danger">{error}</output>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className={`px-4 py-2 rounded-[6px] text-[13px] font-medium text-white disabled:opacity-60 transition-opacity ${
            mode === "approve" ? "bg-ln-op-ok hover:opacity-90" : "bg-ln-op-azul hover:opacity-90"
          }`}
        >
          {pending ? "Procesando..." : mode === "approve" ? "Confirmar aprobación" : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(null);
            setError(null);
            setNotes("");
          }}
          disabled={pending}
          className="px-4 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
