"use client";

import { useState, useTransition } from "react";

import { type EndFosterFormState, endFosterAction } from "@/app/actions/foster";

const SELECTABLE_END_REASONS = [
  { value: "returned", label: "Devolución normal" },
  { value: "early_return_by_foster", label: "Devolución anticipada por el foster" },
  { value: "lost_unrecovered", label: "Perdido sin recuperación" },
  { value: "other", label: "Otro (especificar en notas)" },
] as const;

type ReasonValue = (typeof SELECTABLE_END_REASONS)[number]["value"];

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
        className="px-3 py-1.5 rounded-lg border border-gob-border-strong  text-sm hover:bg-gob-surface-alt  whitespace-nowrap"
      >
        Finalizar tránsito
      </button>
    );
  }

  return (
    <div className="border border-gob-border-strong  rounded-lg p-3 space-y-2 w-full sm:w-80">
      <label htmlFor={`end-reason-${publicToken}`} className="block text-xs text-gob-text-muted">
        Motivo
      </label>
      <select
        id={`end-reason-${publicToken}`}
        value={reason}
        onChange={(e) => setReason(e.target.value as ReasonValue)}
        className="w-full px-3 py-1.5 rounded-lg border border-gob-border-strong  bg-white  text-sm"
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
        className="w-full px-3 py-1.5 rounded-lg border border-gob-border-strong  bg-white  text-sm"
      />
      {error && <output className="block text-xs text-gob-danger">{error}</output>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-3 py-1.5 rounded-lg bg-gob-primary  text-white  text-sm font-medium hover:bg-gob-primary disabled:opacity-50"
        >
          {pending ? "Cerrando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="px-3 py-1.5 rounded-lg border border-gob-border-strong  text-sm"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
