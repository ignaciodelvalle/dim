"use client";

// Species correction form (FULL-LOCK, PO decision #40). Species is read-only on
// the profile-edit form; a genuine correction flows through this dedicated
// affordance, which calls correctPetSpeciesAction — the action emits a
// pet_profile_updated event (audit trail) before updating the column.

import { LnField, LnSelect } from "@/components/ui/Field";
import type { NewPetFormState } from "@/src/modules/pets/actions";
import { useActionState } from "react";

const initialState: NewPetFormState = { error: null };

type FormAction = (prev: NewPetFormState, formData: FormData) => Promise<NewPetFormState>;

const SPECIES_OPTIONS = [
  { value: "dog", label: "Perro" },
  { value: "cat", label: "Gato" },
  { value: "rabbit", label: "Conejo" },
  { value: "guinea_pig", label: "Cobayo" },
  { value: "ferret", label: "Hurón" },
  { value: "other", label: "Otra" },
] as const;

export function CorrectSpeciesForm({
  action,
  currentSpecies,
  petName,
}: {
  action: FormAction;
  currentSpecies: string;
  petName: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <p className="text-sm text-[var(--color-ln-ink-2)]">
        Corregí la especie de <strong>{petName}</strong> solo si se cargó mal. El cambio queda
        registrado en la libreta y vuelve a evaluar las reglas PPP.
      </p>

      <LnField label="Especie correcta" required>
        {({ id, describedBy, invalid }) => (
          <LnSelect
            id={id}
            name="species"
            required
            defaultValue={currentSpecies}
            aria-describedby={describedBy}
            invalid={invalid}
          >
            {SPECIES_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </LnSelect>
        )}
      </LnField>

      {state.error && (
        <p
          className="font-[var(--font-ln-mono)] text-[11.5px] text-[var(--color-ln-err)]"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className={[
          "inline-flex w-full cursor-pointer items-center justify-center gap-[7px] rounded-[3px] border px-4 py-2.5 text-[13px] font-semibold text-white transition-colors",
          "border-[var(--color-ln-azul)] bg-[var(--color-ln-azul)] hover:bg-[var(--color-ln-azul-700)] hover:border-[var(--color-ln-azul-700)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
        ].join(" ")}
      >
        {isPending ? "Guardando..." : "Corregir especie"}
      </button>
    </form>
  );
}
