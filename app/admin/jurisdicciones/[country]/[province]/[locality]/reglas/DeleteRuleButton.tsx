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
    <div className="flex flex-col gap-1">
      <p className="text-[11px] text-ln-op-ink-2">La acción no se puede deshacer.</p>
      <div className="flex gap-2">
        <form action={deleteBusinessRuleAction.bind(null, ruleId)}>
          <input type="hidden" name="jurisdictionCountry" value={country} />
          <input type="hidden" name="jurisdictionProvince" value={province ?? ""} />
          <input type="hidden" name="jurisdictionLocality" value={locality ?? ""} />
          <button
            type="submit"
            className="text-[12px] font-semibold text-ln-op-danger hover:underline underline-offset-4"
          >
            Confirmar eliminación
          </button>
        </form>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-[12px] text-ln-op-mute hover:text-ln-op-ink transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
