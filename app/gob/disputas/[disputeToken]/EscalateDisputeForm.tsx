"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { escalateDisputeAction } from "@/app/actions/custody-disputes";

export function EscalateDisputeForm({ disputeToken }: { disputeToken: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  function cancel() {
    setOpen(false);
    setNotes("");
    setError(null);
  }

  function submit() {
    setError(null);
    setOkMessage(null);
    startTransition(async () => {
      const result = await escalateDisputeAction({ disputeToken, notes });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOkMessage("Escalada registrada. La disputa sigue abierta.");
      setOpen(false);
      setNotes("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-[6px] text-[13px] border border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe transition-colors"
      >
        Escalar a vía judicial
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-[6px] border border-ln-op-line p-4">
      <p className="text-[13px] font-medium text-ln-op-ink">Escalar a vía judicial</p>
      <p className="text-[12px] text-ln-op-mute">
        La disputa queda abierta. Se registra una nota en la historia de la mascota y en el
        historial de auditoría.
      </p>
      <div>
        <label htmlFor="escalate-notes" className="block text-[12px] text-ln-op-mute mb-1">
          Motivo de la escalada (mínimo 20 caracteres)
        </label>
        <textarea
          id="escalate-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Describí el motivo para derivar a vía judicial."
          className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
        />
        <p className="text-[12px] text-ln-op-mute mt-1 tabular-nums">
          {notes.trim().length} / 20 mín.
        </p>
      </div>

      {error && <output className="block text-[13px] text-ln-op-danger">{error}</output>}
      {okMessage && <output className="block text-[13px] text-ln-op-ok">{okMessage}</output>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-4 py-2 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-medium hover:bg-ln-op-azul-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Registrando..." : "Confirmar escalada"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="px-3 py-2 rounded-[6px] border border-ln-op-line text-[13px] text-ln-op-ink hover:bg-ln-op-stripe disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
