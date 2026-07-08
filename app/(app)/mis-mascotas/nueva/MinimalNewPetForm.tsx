"use client";

import { type FormEvent, useActionState, useState } from "react";

import { LocationFields } from "@/components/LocationFields";
import { LnField, LnInput, LnRadio, LnSelect } from "@/components/ui/Field";
import { useActionRedirect } from "@/lib/ui/use-action-redirect";
import type { NewPetFormState } from "@/src/modules/pets/actions";

const initialState: NewPetFormState = { error: null };

type FormAction = (prev: NewPetFormState, formData: FormData) => Promise<NewPetFormState>;

// Species values accepted by parsePetForm.
// "dog" and "cat" map directly; for the "other" branch the sub-select
// value IS the stored species (rabbit, guinea_pig, ferret, other).
const OTHER_SPECIES = [
  { value: "rabbit", label: "Conejo/a" },
  { value: "guinea_pig", label: "Cobayo / Cuy" },
  { value: "ferret", label: "Hurón" },
  { value: "other", label: "Otro" },
] as const;

// ---------------------------------------------------------------------------
// MinimalNewPetForm
// ---------------------------------------------------------------------------

export function MinimalNewPetForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  useActionRedirect(state.redirectTo);
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // The SpeciesField uses chip buttons + a hidden input; browser's required
    // attribute can't guard the no-selection case. Validate client-side.
    const form = e.currentTarget;
    const speciesValue = (form.elements.namedItem("species") as HTMLInputElement | null)?.value;
    if (!speciesValue) {
      e.preventDefault();
      setClientError("Elegí la especie antes de continuar.");
      return;
    }
    // Read localityName via FormData, exactly as the server does. We must NOT
    // use form.elements.namedItem("localityName"): LocationFields renders both
    // an input id="localityName" AND a hidden input name="localityName", so
    // namedItem() returns a RadioNodeList (id+name collision) whose .value is
    // empty — which previously blocked submit even with a locality selected.
    const localityValue = String(new FormData(form).get("localityName") ?? "").trim();
    if (!localityValue) {
      e.preventDefault();
      setClientError("Seleccioná la localidad antes de continuar.");
      return;
    }
    setClientError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* ── Name ─────────────────────────────────────────────────────── */}
      <LnField label="Nombre" required>
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="name"
            type="text"
            required
            placeholder="Luna, Milo, Chicho…"
            aria-describedby={describedBy}
            invalid={invalid}
            autoComplete="off"
            autoFocus
          />
        )}
      </LnField>

      {/* ── Species ──────────────────────────────────────────────────── */}
      <SpeciesField />

      {/* ── Sex ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <p className="font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
          Sexo
        </p>
        <div className="flex flex-col gap-1.5">
          <LnRadio name="sex" value="female">
            Hembra
          </LnRadio>
          <LnRadio name="sex" value="male">
            Macho
          </LnRadio>
          <LnRadio name="sex" value="unknown" defaultChecked>
            No sé
          </LnRadio>
        </div>
      </div>

      {/* ── Location — REQUIRED ──────────────────────────────────────── */}
      {/* UX 3.5 item 2: the wrapper <p> "LOCALIDAD *" was removed because
          LocationFields renders its own <label>Localidad</label> for L1 mode,
          producing a duplicate label. The helper text below + the "Requerido"
          note already convey the required constraint. */}
      <div className="flex flex-col gap-1.5">
        <LocationFields mode="l1" required cascade />
        <p className="font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
          Requerido. Ayuda a las campañas regionales de salud animal.
        </p>
      </div>

      {/* ── Error ────────────────────────────────────────────────────── */}
      {(clientError ?? state?.error) && (
        <p
          className="font-[var(--font-ln-mono)] text-[11.5px] text-[var(--color-ln-err)]"
          role="alert"
        >
          {clientError ?? state?.error}
        </p>
      )}

      {/* ── Submit ───────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={isPending}
        className={[
          "inline-flex w-full cursor-pointer items-center justify-center gap-[7px] rounded-[3px] border px-4 py-2.5 text-[13px] font-semibold text-white transition-colors",
          "border-[var(--color-ln-azul)] bg-[var(--color-ln-azul)] hover:bg-[var(--color-ln-azul-700)] hover:border-[var(--color-ln-azul-700)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {isPending ? (
          <>
            <span
              aria-hidden="true"
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            Guardando...
          </>
        ) : (
          "Crear mascota"
        )}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// SpeciesField — dog / cat chip buttons + other sub-select
// ---------------------------------------------------------------------------

function SpeciesField() {
  const [picked, setPicked] = useState<"dog" | "cat" | "other" | null>(null);

  const chipBase =
    "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border-2 px-3.5 py-3.5 text-[13px] font-semibold transition-colors select-none";
  const chipActive =
    "border-[var(--color-ln-azul)] bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)]";
  const chipIdle =
    "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-[var(--color-ln-ink-2)] hover:border-[var(--color-ln-azul)] hover:bg-[var(--color-ln-celeste-050)]";

  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
        Especie{" "}
        <span className="text-[var(--color-ln-seal)]" aria-hidden="true">
          *
        </span>
      </p>

      {/* Hidden input for dog/cat — avoids double submit on "other" path */}
      {picked !== null && picked !== "other" && (
        <input type="hidden" name="species" value={picked} />
      )}

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { value: "dog", emoji: "🐶", label: "Perro/a" },
            { value: "cat", emoji: "🐱", label: "Gato/a" },
            { value: "other", emoji: "🐾", label: "Otra" },
          ] as const
        ).map(({ value, emoji, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={picked === value}
            onClick={() => setPicked(value)}
            className={[chipBase, picked === value ? chipActive : chipIdle]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="text-[22px] leading-none">{emoji}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Sub-select rendered only when "Otra" is picked */}
      {picked === "other" && (
        <LnField label="¿Cuál?" required>
          {({ id, describedBy, invalid }) => (
            <LnSelect
              id={id}
              name="species"
              required
              aria-describedby={describedBy}
              invalid={invalid}
              defaultValue=""
            >
              <option value="" disabled>
                Seleccioná la especie…
              </option>
              {OTHER_SPECIES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </LnSelect>
          )}
        </LnField>
      )}
    </div>
  );
}
