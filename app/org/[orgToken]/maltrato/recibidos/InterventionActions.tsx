"use client";

// Org-side action surface for a derived welfare report (UI-7).
//
// State machine (gov stays the ONLY closer — no org-side close):
//   none      → [Tomar denuncia]
//   tomado    → [Agregar nota] [Devolver]
//   devuelto  → (terminal for the org; gov re-derives or handles directly)
//
// All three actions call welfare server actions that gate on org membership +
// case-handling role server-side; this component is presentation + optimistic
// router.refresh only.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addInterventionNoteAction,
  returnDerivedReportAction,
  takeDerivedReportAction,
} from "@/src/modules/welfare/actions";

type Mode = "none" | "add_note" | "return";

type InterventionActionsProps = {
  orgToken: string;
  welfareReportId: string;
  interventionStatus: string | null;
};

export function InterventionActions({
  orgToken,
  welfareReportId,
  interventionStatus,
}: InterventionActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("none");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("none");
    setText("");
    setError(null);
  }

  function run(actionFn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await actionFn();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      router.refresh();
    });
  }

  function take() {
    run(() => takeDerivedReportAction({ orgToken, welfareReportId }));
  }

  function submitNote() {
    run(() => addInterventionNoteAction({ orgToken, welfareReportId, text }));
  }

  function submitReturn() {
    run(() => returnDerivedReportAction({ orgToken, welfareReportId, reason: text }));
  }

  // Devuelto is terminal for the org — no further actions.
  if (interventionStatus === "devuelto") {
    return (
      <p className="text-[11px] text-ln-op-mute">
        Devuelta al gobierno. La organización ya no es responsable de esta denuncia.
      </p>
    );
  }

  if (mode === "none") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {interventionStatus !== "tomado" ? (
          <button
            type="button"
            onClick={take}
            disabled={pending}
            className="px-3 py-1.5 rounded-[4px] text-sm font-medium bg-ln-op-azul text-white hover:bg-ln-op-azul-700 transition-colors disabled:opacity-50"
          >
            {pending ? "Procesando..." : "Tomar denuncia"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setMode("add_note")}
              className="px-3 py-1.5 rounded-[4px] text-sm font-medium bg-ln-op-azul text-white hover:bg-ln-op-azul-700 transition-colors"
            >
              Agregar nota
            </button>
            <button
              type="button"
              onClick={() => setMode("return")}
              className="px-3 py-1.5 rounded-[4px] text-sm font-medium border border-ln-op-warn-bd bg-ln-op-warn-bg text-ln-op-warn hover:opacity-90 transition-opacity"
            >
              No podemos intervenir
            </button>
          </>
        )}
        {error && <output className="block text-sm text-ln-op-danger">{error}</output>}
      </div>
    );
  }

  const isReturn = mode === "return";
  const minLen = isReturn ? 10 : 1;

  return (
    <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card p-3 space-y-2">
      <label
        htmlFor={`intervention-text-${welfareReportId}`}
        className="block text-sm font-medium text-ln-op-mute"
      >
        {isReturn
          ? "Motivo de la devolución (mínimo 10 caracteres)"
          : "Nota de intervención (visible para el gobierno)"}
      </label>
      <textarea
        id={`intervention-text-${welfareReportId}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={
          isReturn
            ? "Explicá por qué la organización no puede intervenir..."
            : "Detalle de la intervención en campo, estado del animal, próximos pasos..."
        }
        className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink"
      />
      {error && <output className="block text-sm text-ln-op-danger">{error}</output>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={isReturn ? submitReturn : submitNote}
          disabled={pending || text.trim().length < minLen}
          className="px-4 py-2 rounded-[4px] bg-ln-op-azul text-white text-sm font-medium disabled:opacity-50 hover:bg-ln-op-azul-700 transition-colors"
        >
          {pending ? "Procesando..." : isReturn ? "Confirmar devolución" : "Guardar nota"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="px-4 py-2 rounded-[4px] border border-ln-op-line text-sm text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
