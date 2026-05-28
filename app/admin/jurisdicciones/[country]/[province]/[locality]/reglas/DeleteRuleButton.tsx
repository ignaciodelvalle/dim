"use client";

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
  return (
    <form
      action={deleteBusinessRuleAction.bind(null, ruleId)}
      onSubmit={(e) => {
        if (!confirm("Eliminar esta regla? La acción no se puede deshacer.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="jurisdictionCountry" value={country} />
      <input type="hidden" name="jurisdictionProvince" value={province ?? ""} />
      <input type="hidden" name="jurisdictionLocality" value={locality ?? ""} />
      <button
        type="submit"
        className="text-sm text-gob-danger  underline underline-offset-4 hover:text-gob-danger "
      >
        Eliminar
      </button>
    </form>
  );
}
