"use client";

import { useState } from "react";

import { deleteBusinessRuleAction } from "@/app/actions/business-rules";

export function DeleteRuleButton({
  ruleId,
  country,
  province,
  locality,
}: {
  ruleId: string;
  country: string;
  province: string | null;
  locality: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  const reasonValid = reason.trim().length > 0;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[12px] font-semibold text-ln-op-danger no-underline underline-offset-4 hover:underline"
      >
        Eliminar
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-ln-op-ink-2">
        La acción no se puede deshacer. Eliminar una regla PPP puede des-marcar mascotas afectadas.
      </p>
      <form action={deleteBusinessRuleAction.bind(null, ruleId)} className="flex flex-col gap-2">
        <input type="hidden" name="jurisdictionCountry" value={country} />
        <input type="hidden" name="jurisdictionProvince" value={province ?? ""} />
        <input type="hidden" name="jurisdictionLocality" value={locality ?? ""} />
        <label htmlFor={`delete-rule-reason-${ruleId}`} className="sr-only">
          Motivo de la eliminación
        </label>
        <textarea
          id={`delete-rule-reason-${ruleId}`}
          name="reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo de la eliminación (queda en el audit log)"
          className="w-full rounded-md border border-ln-op-line bg-ln-op-card px-2 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-ln-op-azul"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!reasonValid}
            className="text-[12px] font-semibold text-ln-op-danger underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
          >
            Confirmar eliminación
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setReason("");
            }}
            className="text-[12px] text-ln-op-mute transition-colors hover:text-ln-op-ink"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
