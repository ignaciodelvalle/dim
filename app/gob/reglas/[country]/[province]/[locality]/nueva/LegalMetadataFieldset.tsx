"use client";

// LegalMetadataFieldset — shared fieldset for the govt_business_rules legal
// provenance COLUMNS (migration 0183, spec RM5): requirement tier, legal
// basis, authority, source URL and effective dates. Mounted by EVERY rule
// form (existing 11 + the new obligation forms) so any rule can document
// WHICH law backs it; parsed server-side by the action shim's
// parseLegalMetadata — these fields never pass through the rule-type Zod
// validators because they are not payload.
//
// The requirement tier select renders only when `requirementLevel` is
// provided (obligation-carrying types: rabies_vaccination, sterilization,
// microchip_required). Forms that do not render it simply do not submit the
// field, and the writer leaves the column untouched — so editing e.g. a PPP
// rule never erases its backfilled tier.

import { LnField, LnInput, LnSelect } from "@/components/ui/Field";
import type { RequirementLevel } from "@/db";
import { REQUIREMENT_LEVEL_LABELS } from "@/lib/domain/rule-types-registry";

/** Initial values read off an existing row's COLUMNS (edit mode). */
export type LegalMetadataInitial = {
  requirementLevel: RequirementLevel | null;
  legalBasis: string | null;
  authority: string | null;
  sourceUrl: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
};

type RequirementLevelSelectProps = {
  /** Current tier — "" renders the explicit "Sin definir" option. */
  value: RequirementLevel | "";
  onChange: (value: RequirementLevel | "") => void;
  /** Offer the empty "Sin definir" option (obligation forms yes, microchip no). */
  allowUnset?: boolean;
};

type Props = {
  initial?: LegalMetadataInitial | null;
  /** Absent = no tier select rendered (the field is not submitted at all). */
  requirementLevel?: RequirementLevelSelectProps;
};

export function LegalMetadataFieldset({ initial, requirementLevel }: Props) {
  return (
    <fieldset className="space-y-5 rounded-lg border border-ln-op-line p-4">
      <legend className="px-1 text-md font-semibold text-ln-op-ink">Respaldo normativo</legend>
      <p className="text-md text-ln-op-ink-2">
        Qué norma respalda esta regla. Todos los campos son opcionales: si no hay una cita
        verificada, dejalos vacíos — el sistema nunca inventa normativa.
      </p>

      {requirementLevel && (
        <LnField label="Nivel de exigencia">
          {({ id, describedBy, invalid }) => (
            <LnSelect
              id={id}
              name="requirement_level"
              value={requirementLevel.value}
              onChange={(e) => requirementLevel.onChange(e.target.value as RequirementLevel | "")}
              aria-describedby={describedBy}
              invalid={invalid}
            >
              {requirementLevel.allowUnset && <option value="">Sin definir</option>}
              {Object.entries(REQUIREMENT_LEVEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </LnSelect>
          )}
        </LnField>
      )}

      <LnField label="Base legal">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="legal_basis"
            type="text"
            defaultValue={initial?.legalBasis ?? ""}
            placeholder="Ley / ordenanza / decreto"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="Autoridad de aplicación">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="authority"
            type="text"
            defaultValue={initial?.authority ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="Fuente (URL)">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="source_url"
            type="url"
            defaultValue={initial?.sourceUrl ?? ""}
            placeholder="https://…"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="Vigente desde">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="effective_from"
            type="date"
            defaultValue={initial?.effectiveFrom ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="Vigente hasta">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="effective_until"
            type="date"
            defaultValue={initial?.effectiveUntil ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>
    </fieldset>
  );
}
