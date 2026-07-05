"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  approveAdoptionApplicationAction,
  rejectAdoptionApplicationAction,
  requestInfoAdoptionApplicationAction,
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
  const [mode, setMode] = useState<"approve" | "reject" | "request_info" | null>(null);
  const [sent, setSent] = useState(false);

  function reset() {
    setMode(null);
    setError(null);
    setNotes("");
    setSent(false);
  }

  function confirm() {
    if (!mode) return;
    setError(null);

    if (mode === "request_info") {
      startTransition(async () => {
        const result = await requestInfoAdoptionApplicationAction(orgToken, {
          applicationEventId,
          message: notes,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setSent(true);
      });
      return;
    }

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

  if (sent) {
    return (
      <div className="space-y-3 rounded-[var(--radius-md)] border border-ln-op-ok-bd bg-ln-op-ok-bg p-4">
        <p className="text-[13px] font-medium text-ln-op-ok">Mensaje enviado a {applicantName}.</p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-[13px] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
        >
          Volver a las acciones
        </button>
      </div>
    );
  }

  if (mode === null) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("approve")}
          className="px-4 py-2 rounded-[var(--radius-md)] bg-ln-op-ok text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
        >
          Aprobar postulación
        </button>
        <button
          type="button"
          onClick={() => setMode("request_info")}
          className="px-4 py-2 rounded-[var(--radius-md)] border border-ln-op-azul text-ln-op-azul bg-ln-op-card text-[13px] font-medium hover:bg-ln-op-blue-bg transition-colors"
        >
          Solicitar más información
        </button>
        <button
          type="button"
          onClick={() => setMode("reject")}
          className="px-4 py-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-[13px] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
        >
          No avanzar
        </button>
      </div>
    );
  }

  const labelMap = {
    approve: `Aprobar la postulación de ${applicantName}.`,
    reject: `No avanzar con la postulación de ${applicantName}.`,
    request_info: `Pedirle más información a ${applicantName}.`,
  } as const;

  const hintMap = {
    approve:
      "El postulante recibe una notificación y un mail. La adopción se concreta cuando finalices en su ficha.",
    reject: "El postulante recibe una notificación. Las notas son opcionales.",
    request_info:
      "El postulante recibe una notificación con tu mensaje. La postulación queda pendiente.",
  } as const;

  const placeholderMap = {
    approve: "Notas internas (opcional)",
    reject: "Motivo (opcional)",
    request_info: "Escribí qué información necesitás...",
  } as const;

  const confirmLabelMap = {
    approve: "Confirmar aprobación",
    reject: "Confirmar",
    request_info: "Enviar mensaje",
  } as const;

  const confirmStyleMap = {
    approve: "bg-ln-op-ok hover:opacity-90",
    reject: "bg-ln-op-azul hover:opacity-90",
    request_info: "bg-ln-op-azul hover:opacity-90",
  } as const;

  return (
    <div className="space-y-3 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4">
      <p className="text-[13px] font-medium text-ln-op-ink">{labelMap[mode]}</p>
      <p className="text-sm text-ln-op-mute">{hintMap[mode]}</p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder={placeholderMap[mode]}
        className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
      />
      {error && <output className="block text-sm text-ln-op-danger">{error}</output>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className={`px-4 py-2 rounded-[var(--radius-md)] text-[13px] font-medium text-white disabled:opacity-60 transition-opacity ${confirmStyleMap[mode]}`}
        >
          {pending ? "Procesando..." : confirmLabelMap[mode]}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="px-4 py-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-[13px] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
