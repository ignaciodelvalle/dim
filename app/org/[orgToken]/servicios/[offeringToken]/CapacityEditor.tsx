"use client";

// Inline capacity editor for the offering detail page.
// Shows the current slot capacity, lets an authorized org member change it,
// and surfaces the number of future slots updated on success.

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { updateOfferingCapacityAction } from "@/app/actions/service-offerings";

type Props = {
  orgToken: string;
  offeringToken: string;
  currentCapacity: number;
};

export function CapacityEditor({ orgToken, offeringToken, currentCapacity }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function openEditor() {
    setError(null);
    setSuccessMsg(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function handleSave() {
    const raw = inputRef.current?.value ?? "";
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setError("Ingresá un número entero mayor a 0.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await updateOfferingCapacityAction(orgToken, offeringToken, parsed);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setEditing(false);
      setSuccessMsg(
        result.slotsUpdated === 0
          ? "Capacidad actualizada. No hay turnos futuros para sincronizar."
          : `Se actualizaron ${result.slotsUpdated} turno${result.slotsUpdated === 1 ? "" : "s"} futuro${result.slotsUpdated === 1 ? "" : "s"}.`,
      );
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-1">
        {successMsg && <output className="text-[12px] text-ln-op-ok">{successMsg}</output>}
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-ln-op-ink">
            {currentCapacity} lugar{currentCapacity === 1 ? "" : "es"} por turno
          </span>
          <button
            type="button"
            onClick={openEditor}
            className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-[12px] font-medium text-ln-op-ink-2 transition-colors hover:bg-ln-op-stripe"
          >
            Editar cupos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[12px] font-medium text-ln-op-mute" htmlFor="capacity-input">
        Cupos por turno
      </label>
      <div className="flex items-center gap-2">
        <input
          id="capacity-input"
          ref={inputRef}
          type="number"
          min={1}
          step={1}
          defaultValue={currentCapacity}
          disabled={pending}
          className="w-24 rounded-[4px] border border-ln-op-line px-2 py-[5px] text-[13px] text-ln-op-ink focus:outline-none focus:ring-1 focus:ring-ln-op-azul disabled:opacity-60"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") cancel();
          }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded-[4px] bg-ln-op-azul px-3 py-[5px] text-[12px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-[12px] font-medium text-ln-op-ink transition-colors hover:bg-ln-op-stripe disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
      {error && (
        <p className="text-[12px] text-ln-op-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
