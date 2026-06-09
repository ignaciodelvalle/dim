"use client";

import { useState, useTransition } from "react";

import { type EndFosterFormState, endFosterAction } from "@/src/modules/foster/actions";

const SELECTABLE_END_REASONS = [
  { value: "returned", label: "Devolución normal" },
  { value: "early_return_by_foster", label: "Devolución anticipada por el foster" },
  { value: "lost_unrecovered", label: "Perdido sin recuperación" },
  { value: "other", label: "Otro (especificar en notas)" },
] as const;

type ReasonValue = (typeof SELECTABLE_END_REASONS)[number]["value"];

const fieldCls =
  "w-full rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] text-ln-op-ink focus:outline-none focus:ring-1 focus:ring-ln-op-azul";

export function EndFosterButton({
  orgToken,
  publicToken,
}: {
  orgToken: string;
  publicToken: string;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReasonValue>("returned");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (
      !confirm(
        "¿Confirmar finalización del tránsito? Esto cierra la ownership row de tránsito y notifica al voluntario.",
      )
    )
      return;
    setError(null);
    const formData = new FormData();
    formData.set("reason", reason);
    formData.set("notes", notes);
    startTransition(async () => {
      const result: EndFosterFormState = await endFosterAction(
        orgToken,
        publicToken,
        { error: null },
        formData,
      );
      if (result.error) setError(result.error);
      // success → action redirects; we won't reach here in that case
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-[6px] border border-ln-op-line px-3 py-1.5 text-[12px] text-ln-op-ink hover:bg-ln-op-stripe transition-colors whitespace-nowrap"
      >
        Finalizar tránsito
      </button>
    );
  }

  return (
    <div className="rounded-[6px] border border-ln-op-line bg-ln-op-stripe p-3 space-y-2 w-full sm:w-80">
      <label htmlFor={`end-reason-${publicToken}`} className="block text-[12px] text-ln-op-mute">
        Motivo
      </label>
      <select
        id={`end-reason-${publicToken}`}
        value={reason}
        onChange={(e) => setReason(e.target.value as ReasonValue)}
        className={fieldCls}
      >
        {SELECTABLE_END_REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Notas (opcional)"
        className={fieldCls}
      />
      {error && <output className="block text-[12px] text-ln-op-danger">{error}</output>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-[6px] bg-ln-op-azul px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? "Cerrando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-[6px] border border-ln-op-line px-3 py-1.5 text-[12px] text-ln-op-ink hover:bg-ln-op-stripe transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
