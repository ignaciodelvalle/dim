"use client";

// Owner pet alta — 2-step client wizard (PO decision 2026-07-08).
//
// Motivation: in the old single-screen "minimal" alta, foto and raza were
// buried ~5 clicks deep (only reachable later via the profile edit), so owners
// never loaded them. New shape brings both forward:
//
//   Paso 1 — Identidad : nombre, especie, raza, sexo, provincia → localidad.
//                        PPP notice fires live the moment a dog breed on the
//                        canonical PPP list is picked.
//   Paso 2 — Foto y más: foto prominently (camera OR gallery), then a
//                        "Más datos (opcional)" block (color / señas). Fully
//                        skippable — finishing without a foto is fine.
//
// Atomicity: this stays ONE <form action> that submits ONCE. Both steps are
// kept MOUNTED (toggled with the `hidden` attribute), never conditionally
// unmounted, for three reasons:
//   1. every field — including paso-1 fields — is present in the FormData at
//      the single final submit (no half-created pet, no create-then-attach;
//      the photo is uploaded inside createPetAction from the `photo` field);
//   2. entered values survive back-navigation between steps;
//   3. it sidesteps the React 19 uncontrolled-<form action> auto-reset (text
//      fields are also controlled via useState for reset-safety).

import Link from "next/link";
import { type FormEvent, useActionState, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { LocationFields } from "@/components/LocationFields";
import { LnCallout } from "@/components/ui/DocElements";
import { LnField, LnInput, LnRadio, LnSelect } from "@/components/ui/Field";
import { LnWizardShell } from "@/components/ui/WizardShell";
import { breedsForSpecies, isPotentiallyDangerousBreed } from "@/lib/reference/breeds";
import { useActionRedirect } from "@/lib/ui/use-action-redirect";
import { useIdempotencyKey } from "@/lib/ui/use-idempotency-key";
import type { NewPetFormState } from "@/src/modules/pets/actions";

// es-AR labels for the soft-dedupe confirmation (gate P2). Mirrors the species
// options offered in paso 1; falls back to the raw value for anything else.
const SPECIES_LABEL: Record<string, string> = {
  dog: "perro/a",
  cat: "gato/a",
  rabbit: "conejo/a",
  guinea_pig: "cobayo",
  ferret: "hurón",
  other: "otra especie",
};

const SEX_LABEL: Record<string, string> = {
  female: "hembra",
  male: "macho",
  unknown: "sexo sin especificar",
};

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

type SpeciesPick = "dog" | "cat" | "other" | null;

const TOTAL_STEPS = 2;

// ---------------------------------------------------------------------------
// MinimalNewPetForm
// ---------------------------------------------------------------------------

export function MinimalNewPetForm({
  action,
  isFirstPet = false,
}: {
  action: FormAction;
  isFirstPet?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  useActionRedirect(state.redirectTo);

  const formRef = useRef<HTMLFormElement>(null);

  // Double-submit idempotency (gate P1): a stable UUID per form mount, posted
  // as a hidden field. A network retry / bounce re-submits the SAME key, so the
  // server resolves to the already-created pet instead of minting a duplicate.
  const { key: idempotencyKey } = useIdempotencyKey();

  const [step, setStep] = useState<1 | 2>(1);
  const [clientError, setClientError] = useState<string | null>(null);

  // Soft same-owner dedupe (gate P2). When the owner confirms "no, es otra", we
  // resubmit with duplicateOverride=1 to skip the P2 check (but NOT P1). The
  // effect fires the resubmit only after the hidden input has re-rendered to "1".
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);
  const resubmitAfterOverride = useRef(false);

  useEffect(() => {
    if (overrideDuplicate && resubmitAfterOverride.current) {
      resubmitAfterOverride.current = false;
      formRef.current?.requestSubmit();
    }
  }, [overrideDuplicate]);

  function createAnyway() {
    resubmitAfterOverride.current = true;
    setOverrideDuplicate(true);
  }

  const duplicatePrompt = !overrideDuplicate ? state.duplicatePrompt : undefined;

  // Controlled field state — survives the React 19 form-reset on a server-error
  // return and preserves values across step back-navigation.
  const [name, setName] = useState("");
  const [speciesPick, setSpeciesPick] = useState<SpeciesPick>(null);
  const [otherSpecies, setOtherSpecies] = useState("");
  const [sex, setSex] = useState<"female" | "male" | "unknown">("unknown");
  const [breed, setBreed] = useState("");
  const [color, setColor] = useState("");

  // Resolved species string as parsePetForm expects it.
  const species = speciesPick === "other" ? otherSpecies : (speciesPick ?? "");
  const breedOptions = breedsForSpecies(species);

  // PPP notice — reacts live to breed/species. Uses the canonical country-wide
  // PPP list (lib/reference/breeds.ts). Display-only; the server-side
  // jurisdiction-aware classification at submit time stays authoritative.
  const breedIsDangerous = isPotentiallyDangerousBreed(species, breed);

  function resolvedLocality(): string {
    const form = formRef.current;
    if (!form) return "";
    // Read via FormData exactly as the server does. LocationFields renders both
    // an input id="localityName" AND a hidden input name="localityName", so
    // form.elements.namedItem would return a RadioNodeList with an empty value.
    return String(new FormData(form).get("localityName") ?? "").trim();
  }

  // Paso 1 required-field guard. Advancing is blocked until nombre + especie +
  // localidad (a resolved ar_localities pick) are present. Sexo defaults to
  // "unknown" and raza is optional, mirroring the rest of the app.
  function goToStep2() {
    if (!name.trim()) {
      setClientError("Escribí el nombre de tu mascota.");
      return;
    }
    if (!species) {
      setClientError("Elegí la especie antes de continuar.");
      return;
    }
    if (!resolvedLocality()) {
      setClientError("Elegí la localidad/barrio de la lista de sugerencias.");
      return;
    }
    setClientError(null);
    setStep(2);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // Defensive: the paso-1 fields live in a hidden block on paso 2, so revalidate
    // and bounce back to paso 1 if anything required is missing.
    if (!name.trim() || !species || !resolvedLocality()) {
      e.preventDefault();
      setStep(1);
      setClientError("Completá los datos de identidad antes de crear la mascota.");
      return;
    }
    setClientError(null);
  }

  const errorText = clientError ?? state?.error ?? null;

  return (
    <form ref={formRef} action={formAction} onSubmit={handleSubmit}>
      {/* Data-quality gates: stable idempotency key (P1) + soft-dedupe override (P2). */}
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="duplicateOverride" value={overrideDuplicate ? "1" : "0"} />
      <LnWizardShell
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        stepLabels={["Identidad", "Foto y más"]}
        onBack={step > 1 ? () => setStep(1) : undefined}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[var(--text-2xl)] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
            {isFirstPet ? "Registrar tu primera mascota" : "Registrar mascota"}
          </h1>
          <p className="mt-1 text-md text-[var(--color-ln-mute)]">
            {step === 1
              ? "Empezamos por lo que la identifica."
              : "Sumá una foto y algún dato más. Podés hacerlo ahora o más tarde."}
          </p>
        </div>

        {/* ── Paso 1 — Identidad ─────────────────────────────────────── */}
        <div hidden={step !== 1} className="flex flex-col gap-5">
          {/* Name */}
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
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </LnField>

          {/* Species */}
          <SpeciesField
            picked={speciesPick}
            otherSpecies={otherSpecies}
            onPick={(p) => {
              setSpeciesPick(p);
              setBreed("");
            }}
            onOtherSpeciesChange={(v) => {
              setOtherSpecies(v);
              setBreed("");
            }}
          />

          {/* Breed — optional, species-dependent autocomplete. */}
          <LnField
            label="Raza"
            hint={
              speciesPick === "dog"
                ? "En perros, la raza (y el peso) definen si entra en el régimen PPP."
                : undefined
            }
          >
            {({ id, describedBy }) => (
              <LnInput
                id={id}
                name="breed"
                type="text"
                list="breed-options"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                placeholder={species ? "Empezá a tipear o elegí…" : "Elegí la especie primero"}
                disabled={!species}
                aria-describedby={describedBy}
                autoComplete="off"
              />
            )}
          </LnField>
          <datalist id="breed-options">
            {breedOptions.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>

          {/* PPP notice — appears/disappears live with the breed selection. */}
          {breedIsDangerous && (
            <LnCallout tone="warn" title="Raza potencialmente peligrosa">
              Esta raza está en el registro de razas potencialmente peligrosas (Ley CABA 4078, Ley
              Provincial 14.107). Registrate en el registro provincial correspondiente.
            </LnCallout>
          )}

          {/* Sex */}
          <div className="flex flex-col gap-1.5">
            <p className="font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
              Sexo
            </p>
            <div className="flex flex-col gap-1.5">
              <LnRadio
                name="sex"
                value="female"
                checked={sex === "female"}
                onChange={() => setSex("female")}
              >
                Hembra
              </LnRadio>
              <LnRadio
                name="sex"
                value="male"
                checked={sex === "male"}
                onChange={() => setSex("male")}
              >
                Macho
              </LnRadio>
              <LnRadio
                name="sex"
                value="unknown"
                checked={sex === "unknown"}
                onChange={() => setSex("unknown")}
              >
                No sé
              </LnRadio>
            </div>
          </div>

          {/* Location — REQUIRED. Province-first cascade (commit 38fb1f44). */}
          <div className="flex flex-col gap-1.5">
            <LocationFields mode="l1" required cascade />
            <p className="font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
              Requerido. Ayuda a las campañas regionales de salud animal.
            </p>
          </div>
        </div>

        {/* ── Paso 2 — Foto y más ────────────────────────────────────── */}
        <div hidden={step !== 2} className="flex flex-col gap-5">
          <PhotoField />

          <details className="group rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 text-sm font-semibold text-[var(--color-ln-ink-2)] select-none">
              <span>Más datos (opcional)</span>
              <span
                aria-hidden="true"
                className="text-[var(--color-ln-faint)] transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-[var(--color-ln-line)] px-3.5 py-3">
              <LnField label="Color / señas">
                {({ id, describedBy }) => (
                  <LnInput
                    id={id}
                    name="color"
                    type="text"
                    placeholder="Atigrado, mancha blanca en el pecho…"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    aria-describedby={describedBy}
                    autoComplete="off"
                  />
                )}
              </LnField>
            </div>
          </details>
        </div>

        {/* ── Error ──────────────────────────────────────────────────── */}
        {errorText && (
          <p
            className="mt-4 font-[var(--font-ln-mono)] text-[11.5px] text-[var(--color-ln-err)]"
            role="alert"
          >
            {errorText}
          </p>
        )}

        {/* ── Soft same-owner dedupe confirm (gate P2) ───────────────── */}
        {step === 2 && duplicatePrompt && (
          <div className="mt-4" role="alert">
            <LnCallout tone="azul" title="¿Es la misma mascota?">
              <p className="m-0">
                Ya tenés registrada a <strong>{duplicatePrompt.name}</strong> (
                {SPECIES_LABEL[duplicatePrompt.species] ?? duplicatePrompt.species},{" "}
                {SEX_LABEL[duplicatePrompt.sex] ?? duplicatePrompt.sex}). ¿Es la misma?
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href={`/mis-mascotas/${duplicatePrompt.publicToken}`}
                  className="inline-flex w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-ln-azul)] bg-[var(--color-ln-azul)] px-4 py-2.5 text-[var(--text-md)] font-semibold text-white no-underline transition-colors hover:border-[var(--color-ln-azul-700)] hover:bg-[var(--color-ln-azul-700)]"
                >
                  Ver a {duplicatePrompt.name}
                </Link>
                <button
                  type="button"
                  onClick={createAnyway}
                  className="inline-flex w-full cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-4 py-2.5 text-[var(--text-md)] font-semibold text-[var(--color-ln-ink-2)] transition-colors hover:border-[var(--color-ln-azul)] hover:bg-[var(--color-ln-celeste-050)]"
                >
                  No, es otra — crear igual
                </button>
              </div>
            </LnCallout>
          </div>
        )}

        {/* ── Footer actions ─────────────────────────────────────────── */}
        <div className="mt-6">
          {step === 1 ? (
            <button
              type="button"
              onClick={goToStep2}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-ln-azul)] bg-[var(--color-ln-azul)] px-4 py-2.5 text-[var(--text-md)] font-semibold text-white transition-colors hover:border-[var(--color-ln-azul-700)] hover:bg-[var(--color-ln-azul-700)]"
            >
              Continuar
            </button>
          ) : duplicatePrompt ? null : (
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-ln-azul)] bg-[var(--color-ln-azul)] px-4 py-2.5 text-[var(--text-md)] font-semibold text-white transition-colors hover:border-[var(--color-ln-azul-700)] hover:bg-[var(--color-ln-azul-700)] disabled:cursor-not-allowed disabled:opacity-60"
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
          )}
        </div>
      </LnWizardShell>
    </form>
  );
}

// ---------------------------------------------------------------------------
// SpeciesField — dog / cat chip buttons + other sub-select (controlled)
// ---------------------------------------------------------------------------

function SpeciesField({
  picked,
  otherSpecies,
  onPick,
  onOtherSpeciesChange,
}: {
  picked: SpeciesPick;
  otherSpecies: string;
  onPick: (p: SpeciesPick) => void;
  onOtherSpeciesChange: (v: string) => void;
}) {
  const chipBase =
    "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border-2 px-3.5 py-3.5 text-[var(--text-md)] font-semibold transition-colors select-none";
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

      {/* Hidden input for dog/cat — avoids double submit on the "other" path */}
      {picked !== null && picked !== "other" && (
        <input type="hidden" name="species" value={picked} />
      )}

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { value: "dog", icon: "perro", label: "Perro/a" },
            { value: "cat", icon: "gato", label: "Gato/a" },
            { value: "other", icon: "huella", label: "Otra" },
          ] as const
        ).map(({ value, icon, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={picked === value}
            onClick={() => onPick(value)}
            className={[chipBase, picked === value ? chipActive : chipIdle]
              .filter(Boolean)
              .join(" ")}
          >
            <Icon name={icon} size={24} decorative />
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
              value={otherSpecies}
              onChange={(e) => onOtherSpeciesChange(e.target.value)}
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

// ---------------------------------------------------------------------------
// PhotoField — prominent uploader; camera AND gallery; preview + removable.
// ---------------------------------------------------------------------------

function PhotoField() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function removePhoto() {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
        Foto{" "}
        <span className="font-normal lowercase tracking-[.04em] text-[var(--color-ln-faint)]">
          opcional
        </span>
      </p>
      {/* No `capture` attribute: on mobile the OS picker offers BOTH the camera
          and the photo gallery, instead of forcing the camera. */}
      <label
        htmlFor="photo"
        className="flex cursor-pointer items-center gap-3.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-ln-line-strong)] p-3 transition-colors hover:bg-[var(--color-ln-stripe)]"
      >
        {preview ? (
          <img
            src={preview}
            alt="Vista previa de la mascota"
            className="h-[84px] w-[84px] flex-shrink-0 rounded-[var(--radius-md)] object-cover"
          />
        ) : (
          <div className="flex h-[84px] w-[84px] flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-ln-stripe)] text-[var(--text-sm)] text-[var(--color-ln-mute)]">
            Sin foto
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[var(--text-md)] font-medium text-[var(--color-ln-ink-2)]">
            {preview ? "Cambiar foto" : "Tomar o elegir una foto"}
          </p>
          <p className="mt-0.5 font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
            Cámara o galería. JPG o PNG, hasta 5 MB.
          </p>
        </div>
      </label>
      <input
        ref={inputRef}
        id="photo"
        name="photo"
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="sr-only"
      />
      {preview && (
        <button
          type="button"
          onClick={removePhoto}
          className="self-start font-[var(--font-ln-mono)] text-[var(--text-sm)] tracking-[.04em] text-[var(--color-ln-azul)] underline underline-offset-2"
        >
          Quitar foto
        </button>
      )}
    </div>
  );
}
