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
          className="px-4 py-2 rounded-lg bg-gob-success text-white text-sm font-medium hover:bg-gob-success"
        >
          Aprobar postulación
        </button>
        <button
          type="button"
          onClick={() => setMode("reject")}
          className="px-4 py-2 rounded-lg border border-gob-border-strong  text-sm font-medium hover:bg-gob-surface-alt "
        >
          No avanzar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-gob-border-strong  p-4">
      <p className="text-sm font-medium text-gob-text ">
        {mode === "approve"
          ? `Aprobar la postulación de ${applicantName}.`
          : `No avanzar con la postulación de ${applicantName}.`}
      </p>
      <p className="text-xs text-gob-text-gray ">
        {mode === "approve"
          ? "El postulante recibe una notificación y un mail. La adopción se concreta cuando finalices en su ficha."
          : "El postulante recibe una notificación. Las notas son opcionales."}
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder={mode === "approve" ? "Notas internas (opcional)" : "Motivo (opcional)"}
        className="w-full px-3 py-2 rounded border border-gob-border-strong  bg-white  text-sm"
      />
      {error && <output className="block text-sm text-gob-danger ">{error}</output>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 ${
            mode === "approve"
              ? "bg-gob-success text-white hover:bg-gob-success"
              : "bg-gob-primary  text-white "
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
          className="px-4 py-2 rounded-lg border border-gob-border-strong  text-sm font-medium"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
