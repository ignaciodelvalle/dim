"use client";

// MicrochipRequiredForm — admin/govt form for the microchip_required rule
// type (E5, 2026-07-21 facades harvest). Migration 0150 widened the
// govt_business_rules CHECK constraint and the domain layer (validator,
// default, RULE_TYPE_REGISTRY entry) already shipped — only this write-side
// form was missing, so the govt read lens (owner compliance panel via
// resolveBusinessRule) could show the resolved value but no jurisdiction
// could ever override the default: true. Follows the PhysicalCredentialChannelsForm
// template — no impact-preview gate (decision #651): this rule changes
// notification/compliance-panel derivation, not record legal status.

import { useActionState, useEffect, useState } from "react";

import {
  type BusinessRuleFormState,
  createBusinessRuleAction,
  updateBusinessRuleAction,
} from "@/app/actions/business-rules";
import { LnAlert } from "@/components/ui/Alert";
import { LnCheckbox, LnField, LnTextarea } from "@/components/ui/Field";
import { OpButton } from "@/components/ui/dashboard";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";

const initialState: BusinessRuleFormState = { error: null };

type Props = {
  mode: "create" | "edit";
  ruleId?: string;
  country: string;
  province: string | null;
  locality: string | null;
  base: "/admin" | "/gob";
  initialRequired: boolean;
  initialNotes: string;
};

export function MicrochipRequiredForm({
  mode,
  ruleId,
  country,
  province,
  locality,
  base,
  initialRequired,
  initialNotes,
}: Props) {
  const action =
    mode === "edit" && ruleId
      ? updateBusinessRuleAction.bind(null, ruleId)
      : createBusinessRuleAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [required, setRequired] = useState(initialRequired);

  // Router-drop workaround (verify-report #650 WARNING-1) — see
  // lib/ui/full-page-action-nav.ts's module docblock.
  useEffect(() => {
    if (state.redirectTo) navigateAfterActionSuccess(state.redirectTo);
  }, [state.redirectTo]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="ruleType" value="microchip_required" />
      <input type="hidden" name="jurisdictionCountry" value={country} />
      <input type="hidden" name="jurisdictionProvince" value={province ?? ""} />
      <input type="hidden" name="jurisdictionLocality" value={locality ?? ""} />
      <input type="hidden" name="portalBase" value={base} />

      <p className="text-md text-ln-op-ink-2">
        Si esta jurisdicción exige la identificación por microchip. Por defecto es obligatorio en
        todo el país (migración 0150) — esta regla permite que una jurisdicción específica opte por
        NO exigirlo.
      </p>

      <LnCheckbox
        name="required"
        checked={required}
        onChange={(e) => setRequired(e.target.checked)}
      >
        Microchip obligatorio en esta jurisdicción
      </LnCheckbox>

      <LnField label="Notas internas">
        {({ id, describedBy, invalid }) => (
          <LnTextarea
            id={id}
            name="notes"
            defaultValue={initialNotes}
            rows={3}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnAlert variant="warning">
        Este cambio aplica inmediatamente a toda la jurisdicción seleccionada — afecta el panel de
        cumplimiento ("N de M al día") de cada mascota registrada ahí.
      </LnAlert>

      {state.warning && <p className="text-md text-ln-op-warn">{state.warning}</p>}
      {state.error && (
        <p className="text-md text-ln-op-danger" role="alert">
          {state.error}
        </p>
      )}

      <OpButton type="submit" disabled={isPending} loading={isPending} variant="primary" block>
        {isPending ? "Guardando..." : mode === "create" ? "Crear regla" : "Guardar cambios"}
      </OpButton>
    </form>
  );
}
