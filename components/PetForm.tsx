"use client";

// Shared pet form. Used by both /mis-mascotas/nueva (create) and
// /mis-mascotas/[token]/editar (edit). Mode is determined by the `existingPet`
// prop — present means edit, absent means create. The action prop is bound
// at the call site so the form doesn't need to know which it's calling.

import type { NewPetFormState } from "@/app/actions/pets";
import type { Pet } from "@/db";
import { provinceByName } from "@/lib/ar-provincias";
import { breedsForSpecies, isPotentiallyDangerousBreed } from "@/lib/breeds";
import { inputClass, labelClass } from "@/lib/form-classes";
import {
  COMMON_ALLERGIES,
  COMMON_FOODS,
  INSURANCE_COMPANIES,
  MICROCHIP_LOCATIONS,
  TRAINING_LEVELS,
} from "@/lib/lookups";
import {
  PERMANENT_CONDITIONS,
  PERMANENT_CONDITION_GROUPS,
  type PermanentCondition,
  permanentConditionGroup,
  permanentConditionLabel,
} from "@/lib/permanent-conditions";
import { useActionState, useMemo, useState } from "react";
import { LocationFields } from "./LocationFields";

const initialState: NewPetFormState = { error: null };

type FormAction = (prev: NewPetFormState, formData: FormData) => Promise<NewPetFormState>;

export function PetForm({
  action,
  existingPet,
  existingPhotoUrl,
  compact,
  submitLabel,
  pendingLabel,
  hiddenFields,
}: {
  action: FormAction;
  existingPet?: Pet;
  existingPhotoUrl?: string | null;
  // `compact` collapses the form to just the "Lo básico" section. Used by
  // the inline first-pet capture at signup (AGENTS.md → v1 screens §Signup):
  // ask only for photo + name + species + base info, owner fills the rest
  // later via /mis-mascotas/{token}/editar.
  compact?: boolean;
  // Optional overrides for the submit button copy. Defaults remain
  // "Crear mascota" / "Guardar cambios" / "Guardando…".
  submitLabel?: string;
  pendingLabel?: string;
  // Optional hidden form fields (e.g. a redirectTo hint for the server
  // action when the same action is reused across flows). Rendered as
  // <input type="hidden"> inside the <form>.
  hiddenFields?: Record<string, string>;
}) {
  const isEdit = !!existingPet;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [photoPreview, setPhotoPreview] = useState<string | null>(existingPhotoUrl ?? null);
  // `species` is always the persisted (resolved) value: dog | cat | rabbit |
  // guinea_pig | ferret | other. The top select reflects the *group* (dog,
  // cat, or "other") and a sub-select appears under "other" with the
  // companion-animal options. Storing the resolved value keeps every
  // species-aware helper (breedsForSpecies, isPotentiallyDangerousBreed)
  // working without a separate translation layer.
  const [species, setSpecies] = useState<string>(existingPet?.species ?? "");
  const [breed, setBreed] = useState<string>(existingPet?.breed ?? "");

  const OTHER_SPECIES_VALUES = ["rabbit", "guinea_pig", "ferret"] as const;
  type OtherSpeciesValue = (typeof OTHER_SPECIES_VALUES)[number];
  function isCompanionOther(value: string): value is OtherSpeciesValue {
    return (OTHER_SPECIES_VALUES as readonly string[]).includes(value);
  }
  const speciesGroup: "" | "dog" | "cat" | "other" =
    species === "dog" || species === "cat" ? species : species === "" ? "" : "other";
  const subSpecies: OtherSpeciesValue | "other_unlisted" | "" = isCompanionOther(species)
    ? species
    : species === "other"
      ? "other_unlisted"
      : "";
  const [custodyKind, setCustodyKind] = useState<"owner" | "foster_in_transit">("owner");

  // Permanent conditions state. We keep the array as a Set for cheap
  // toggling; serialize to a CSV hidden field at submit time (one input
  // per pattern would also work but a single hidden value is simpler to
  // parse server-side).
  const initialConditions: ReadonlyArray<PermanentCondition> =
    (existingPet?.permanentConditions ?? []).filter((c): c is PermanentCondition =>
      (PERMANENT_CONDITIONS as readonly string[]).includes(c),
    ) ?? [];
  const [conditions, setConditions] = useState<Set<PermanentCondition>>(new Set(initialConditions));
  const [conditionsOther, setConditionsOther] = useState<string>(
    existingPet?.permanentConditionsOther ?? "",
  );
  const [discloseConditions, setDiscloseConditions] = useState<boolean>(
    existingPet?.discloseConditionsPublicly ?? false,
  );

  function toggleCondition(code: PermanentCondition) {
    setConditions((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const breedOptions = useMemo(() => breedsForSpecies(species), [species]);
  const breedIsDangerous = isPotentiallyDangerousBreed(species, breed);

  const initialAge = useMemo(
    () => ageFromDateOfBirth(existingPet?.dateOfBirth ?? null),
    [existingPet?.dateOfBirth],
  );

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (photoPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }
    if (file) {
      setPhotoPreview(URL.createObjectURL(file));
    } else {
      setPhotoPreview(existingPhotoUrl ?? null);
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      {/* SECTION: ¿Es tu mascota o la estás cuidando?
          Hidden in compact mode (signup) and in edit mode — changing custody
          is a separate flow, not a form edit. Defaults to 'owner'. */}
      {!compact && !isEdit && <CustodyKindToggle value={custodyKind} onChange={setCustodyKind} />}
      {/* SECTION: Lo básico */}
      <Section title="Lo básico" defaultOpen>
        <PhotoField onFileChange={handlePhotoChange} preview={photoPreview} />

        <Field
          id="name"
          name="name"
          type="text"
          label="Nombre"
          required
          autoComplete="off"
          defaultValue={existingPet?.name}
        />

        {/* The persisted species value travels as a hidden input. The visible
            top select drives the speciesGroup state; if the group is "other",
            a sub-select picks the concrete companion species. */}
        <input type="hidden" name="species" value={species} />
        <SelectField
          id="species-group"
          name="speciesGroup"
          label="Especie"
          required
          value={speciesGroup}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "dog" || next === "cat") {
              setSpecies(next);
            } else if (next === "other") {
              // Default the sub-select to a sensible empty so the form
              // can't submit a half-state; the required attribute on the
              // sub-select catches it before formAction runs.
              setSpecies("");
            } else {
              setSpecies("");
            }
            setBreed("");
          }}
        >
          <option value="">Elegí una</option>
          <option value="dog">Perro</option>
          <option value="cat">Gato</option>
          <option value="other">Otra</option>
        </SelectField>
        {speciesGroup === "other" && (
          <SelectField
            id="species-subgroup"
            name="speciesSubgroup"
            label='Tipo de "Otra"'
            required
            value={subSpecies}
            onChange={(e) => {
              const next = e.target.value;
              setSpecies(next === "other_unlisted" ? "other" : next);
              setBreed("");
            }}
          >
            <option value="">Elegí una</option>
            <option value="rabbit">Conejo</option>
            <option value="guinea_pig">Cobayo</option>
            <option value="ferret">Hurón</option>
            <option value="other_unlisted">Otro / no listado</option>
          </SelectField>
        )}

        <SelectField
          id="sex"
          name="sex"
          label="Sexo"
          required
          defaultValue={existingPet?.sex ?? "unknown"}
        >
          <option value="unknown">No sé</option>
          <option value="male">Macho</option>
          <option value="female">Hembra</option>
        </SelectField>

        <AgeFields defaultYears={initialAge.years} defaultMonths={initialAge.months} />

        <Field
          id="color"
          name="color"
          type="text"
          label="Color / marcas"
          defaultValue={existingPet?.color ?? undefined}
        />
      </Section>

      {!compact && (
        <>
          {/* SECTION: Identificación y raza */}
          <Section title="Identificación y raza" defaultOpen={isEdit && !!existingPet?.breed}>
            <div className="space-y-1.5">
              <label htmlFor="breed" className={labelClass}>
                Raza
              </label>
              <input
                id="breed"
                name="breed"
                type="text"
                list="breed-options"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                placeholder={species ? "Empezá a tipear o elegí…" : "Elegí especie primero"}
                disabled={!species}
                className={`${inputClass} disabled:opacity-50`}
              />
              <datalist id="breed-options">
                {breedOptions.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              {breedIsDangerous && (
                <div className="mt-2 p-3 rounded-lg border border-gob-warning  bg-gob-warning/10  text-xs text-gob-warning-text ">
                  Esta raza está en el registro de razas potencialmente peligrosas (Ley CABA 4078,
                  Ley Provincial 14.107). Vas a tener que registrarte en el registro provincial
                  correspondiente. MiMAR marcará tu mascota con la flag oficial y te avisará en
                  notificaciones.
                </div>
              )}
            </div>

            <SelectField
              id="acquisitionMethod"
              name="acquisitionMethod"
              label={
                isEdit
                  ? `¿Cómo llegó ${existingPet?.name ?? "tu mascota"}?`
                  : "¿Cómo te encontraste con esta mascota?"
              }
              defaultValue={existingPet?.acquisitionMethod ?? ""}
            >
              <option value="">No especificar</option>
              <option value="adopted">Adoptado/a</option>
              <option value="purchased">Comprado/a</option>
              <option value="found_stray">Encontrado/a en la calle</option>
              <option value="gift">Regalado/a</option>
              <option value="born_in_litter">Nacido/a en casa (camada propia)</option>
              <option value="other">Otro</option>
            </SelectField>

            <MicrochipBlock existingPet={existingPet} />
          </Section>

          {/* SECTION: Salud y vida diaria */}
          <Section title="Salud y vida diaria">
            <Field
              id="estimatedWeightKg"
              name="estimatedWeightKg"
              type="number"
              label="Peso estimado (kg)"
              step="0.1"
              min="0"
              defaultValue={existingPet?.estimatedWeightKg ?? undefined}
            />

            <CheckboxGroup
              name="favouriteFoods"
              label="Comidas favoritas"
              options={COMMON_FOODS}
              otherFieldName="favouriteFoodsOther"
              defaultValues={existingPet?.favouriteFoods ?? []}
            />

            <CheckboxGroup
              name="knownAllergies"
              label="Alergias conocidas"
              options={COMMON_ALLERGIES}
              otherFieldName="knownAllergiesOther"
              defaultValues={existingPet?.knownAllergies ?? []}
            />

            <SelectField
              id="trainingLevel"
              name="trainingLevel"
              label="Nivel de entrenamiento"
              defaultValue={existingPet?.trainingLevel ?? ""}
            >
              <option value="">No especificar</option>
              {TRAINING_LEVELS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </SelectField>
          </Section>

          {/* SECTION: Seguro */}
          <Section title="Seguro de mascota">
            <div className="space-y-1.5">
              <label htmlFor="insuranceCompany" className={labelClass}>
                Compañía
              </label>
              <input
                id="insuranceCompany"
                name="insuranceCompany"
                type="text"
                list="insurance-companies"
                placeholder="Buscar o tipear…"
                defaultValue={existingPet?.insuranceCompany ?? undefined}
                className={inputClass}
              />
              <datalist id="insurance-companies">
                {INSURANCE_COMPANIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <Field
              id="insurancePolicyNumber"
              name="insurancePolicyNumber"
              type="text"
              label="Número de póliza"
              defaultValue={existingPet?.insurancePolicyNumber ?? undefined}
            />
          </Section>

          {/* SECTION: Documentos (placeholder) */}
          <Section title="Documentos y certificaciones">
            <div className="rounded-lg border border-dashed border-gob-border-strong  p-4 text-center text-sm text-gob-text-muted ">
              Pasaporte de viaje, certificado de perro de servicio, otros.
              <br />
              <span className="text-xs">Próximamente</span>
            </div>
          </Section>

          {/* SECTION: Smart devices */}
          <Section title="Dispositivos conectados">
            <div className="rounded-lg border border-dashed border-gob-border-strong  p-4 text-center space-y-3">
              <p className="text-sm text-gob-text-gray ">
                Cámaras, comederos automáticos, collares GPS, sensores.
              </p>
              <button
                type="button"
                disabled
                className="px-4 py-2 rounded-lg border border-gob-border-strong  text-sm text-gob-text-muted  disabled:cursor-not-allowed"
              >
                Conectar dispositivo (próximamente)
              </button>
            </div>
          </Section>

          {/* SECTION: Ubicación */}
          <Section
            title="Ubicación (ayuda a las campañas de salud animal)"
            defaultOpen={isEdit && !!existingPet?.jurisdictionProvince}
          >
            <LocationFields
              mode="l1"
              defaultValue={{
                // Existing rows store the display name in jurisdiction_province;
                // resolve to the ISO code for the select. Once the canonical-
                // codes migration lands (deferred until gov dashboards) this
                // lookup becomes a pass-through.
                provinceCode: provinceByName(existingPet?.jurisdictionProvince)?.code ?? null,
                localityName: existingPet?.jurisdictionLocality ?? null,
              }}
            />
          </Section>

          {/* SECTION: Credencial pública */}
          <Section
            title="Credencial pública"
            defaultOpen={isEdit && !!existingPet?.emergencyInfoVisible}
          >
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="emergencyInfoVisible"
                value="true"
                defaultChecked={!!existingPet?.emergencyInfoVisible}
                className="mt-0.5 rounded border-gob-border-strong  text-gob-text  focus:ring-gob-primary "
              />
              <span className="space-y-0.5">
                <span className="block text-sm text-gob-text ">
                  Mostrar aviso de emergencia médica en la credencial pública
                </span>
                <span className="block text-xs text-gob-text-gray ">
                  Aparece en la página pública sin revelar tu nombre ni datos sensibles.
                </span>
              </span>
            </label>
          </Section>

          {/* SECTION: Condiciones permanentes */}
          <Section title="Condiciones permanentes" defaultOpen={isEdit && conditions.size > 0}>
            <input
              type="hidden"
              name="permanentConditions"
              value={Array.from(conditions).join(",")}
            />
            <p className="text-xs text-gob-text-gray  mb-3">
              Marcá si tu mascota convive con alguna condición de por vida (sentidos, motora,
              médica). Esto ayuda a otros veterinarios y, si decidís compartirla, a personas que
              quieran adoptarla.
            </p>
            <div className="space-y-3">
              {PERMANENT_CONDITION_GROUPS.map((group) => {
                const codes = PERMANENT_CONDITIONS.filter(
                  (c) => permanentConditionGroup(c) === group.id,
                );
                if (codes.length === 0) return null;
                return (
                  <fieldset key={group.id} className="space-y-1">
                    <legend className="text-xs font-medium uppercase tracking-wide text-gob-text-muted">
                      {group.label}
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {codes.map((code) => (
                        <label
                          key={code}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={conditions.has(code)}
                            onChange={() => toggleCondition(code)}
                            className="rounded border-gob-border-strong  text-gob-text  focus:ring-gob-primary "
                          />
                          <span className="text-gob-text ">{permanentConditionLabel(code)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
            {conditions.has("otra") && (
              <div className="mt-3 space-y-1">
                <label htmlFor="permanentConditionsOther" className={labelClass}>
                  Especificá la condición
                </label>
                <input
                  id="permanentConditionsOther"
                  name="permanentConditionsOther"
                  type="text"
                  required={conditions.has("otra")}
                  maxLength={120}
                  value={conditionsOther}
                  onChange={(e) => setConditionsOther(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gob-border-strong  bg-white  text-sm"
                />
              </div>
            )}
            {!conditions.has("otra") && (
              <input type="hidden" name="permanentConditionsOther" value="" />
            )}
            <label className="mt-4 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="discloseConditionsPublicly"
                value="true"
                checked={discloseConditions}
                onChange={(e) => setDiscloseConditions(e.target.checked)}
                disabled={conditions.size === 0}
                className="mt-0.5 rounded border-gob-border-strong  text-gob-text  focus:ring-gob-primary  disabled:opacity-50"
              />
              <span className="space-y-0.5">
                <span className="block text-sm text-gob-text ">
                  Compartir estas condiciones en superficies públicas
                </span>
                <span className="block text-xs text-gob-text-gray ">
                  Cuando está marcado, las condiciones se muestran en la credencial pública y en{" "}
                  /adoptar si el refugio publica al pet en adopción. Sin esto quedan privadas.
                </span>
              </span>
            </label>
          </Section>
        </>
      )}

      {state.error && (
        <p className="text-sm text-gob-danger " role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending
          ? (pendingLabel ?? "Guardando...")
          : (submitLabel ?? (isEdit ? "Guardar cambios" : "Crear mascota"))}
      </button>
    </form>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function CustodyKindToggle({
  value,
  onChange,
}: {
  value: "owner" | "foster_in_transit";
  onChange: (v: "owner" | "foster_in_transit") => void;
}) {
  return (
    <div className="space-y-3">
      <span className={labelClass}>¿Es tu mascota o la estás cuidando?</span>
      <input type="hidden" name="custodyKind" value={value} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CustodyOptionCard
          checked={value === "owner"}
          onSelect={() => onChange("owner")}
          title="Es mi mascota"
          description="La adoptaste, te la regalaron, la compraste, o ya vive con vos como tuya."
        />
        <CustodyOptionCard
          checked={value === "foster_in_transit"}
          onSelect={() => onChange("foster_in_transit")}
          title="La estoy cuidando"
          description="La encontraste, te la pasó alguien, o la tenés en tránsito mientras buscás dueño o un refugio."
        />
      </div>
      {value === "foster_in_transit" && (
        <p className="text-xs text-gob-text-gray  px-3 py-2 rounded-lg bg-gob-surface-alt  border border-gob-border ">
          Vas a poder llevarle la libreta sanitaria mientras la cuidás. La información viaja con la
          mascota si aparece su familia o pasa a un refugio. Si más adelante la adoptás formalmente,
          vas a poder convertirla en tuya desde su perfil.
        </p>
      )}
    </div>
  );
}

function CustodyOptionCard({
  checked,
  onSelect,
  title,
  description,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={checked}
      className={
        checked
          ? "text-left px-4 py-3 rounded-lg border-2 border-gob-border-strong  bg-gob-surface-alt  transition-colors"
          : "text-left px-4 py-3 rounded-lg border border-gob-border  hover:bg-gob-surface-alt  transition-colors"
      }
    >
      <p className="text-sm font-medium text-gob-text ">{title}</p>
      <p className="text-xs text-gob-text-gray  mt-1">{description}</p>
    </button>
  );
}

function ageFromDateOfBirth(dob: string | null): {
  years: number | null;
  months: number | null;
} {
  if (!dob) return { years: null, months: null };
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return { years: null, months: null };
  const now = new Date();
  let totalMonths = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) totalMonths -= 1;
  if (totalMonths < 0) totalMonths = 0;
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
  };
}

// ============================================================================
// Composable building blocks
// ============================================================================

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-gob-border  bg-white ">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gob-text  flex items-center justify-between hover:bg-gob-surface-alt  rounded-lg">
        <span>{title}</span>
        <span className="text-gob-text-muted  group-open:rotate-90 transition-transform">›</span>
      </summary>
      <div className="p-4 pt-2 space-y-4 border-t border-gob-border ">{children}</div>
    </details>
  );
}

function AgeFields({
  defaultYears,
  defaultMonths,
}: {
  defaultYears: number | null;
  defaultMonths: number | null;
}) {
  return (
    <div className="space-y-1.5">
      <span className={labelClass}>Edad aproximada</span>
      <div className="grid grid-cols-2 gap-3">
        <input
          id="ageYears"
          name="ageYears"
          type="number"
          min="0"
          max="40"
          placeholder="Años"
          defaultValue={defaultYears ?? undefined}
          className={inputClass}
        />
        <input
          id="ageMonths"
          name="ageMonths"
          type="number"
          min="0"
          max="11"
          placeholder="Meses"
          defaultValue={defaultMonths ?? undefined}
          className={inputClass}
        />
      </div>
      <p className="text-xs text-gob-text-muted ">Si no sabés exacto, una estimación está bien.</p>
    </div>
  );
}

function MicrochipBlock({ existingPet }: { existingPet?: Pet }) {
  return (
    <div className="space-y-3 pt-3 border-t border-gob-border-strong ">
      <p className="text-xs text-gob-text-muted  uppercase tracking-wider">Microchip</p>
      <Field
        id="microchipId"
        name="microchipId"
        type="text"
        label="Número de chip (15 dígitos, ISO 11784/11785)"
        autoComplete="off"
        defaultValue={existingPet?.microchipId ?? undefined}
      />
      <Field
        id="microchipCountryCode"
        name="microchipCountryCode"
        type="text"
        label="Código de país"
        defaultValue={existingPet?.microchipCountryCode ?? "858"}
      />
      <Field
        id="microchipImplantedAt"
        name="microchipImplantedAt"
        type="date"
        label="Fecha de implantación"
        defaultValue={existingPet?.microchipImplantedAt ?? undefined}
      />
      <Field
        id="microchipImplantedBy"
        name="microchipImplantedBy"
        type="text"
        label="Implantado por (vet / clínica)"
        defaultValue={existingPet?.microchipImplantedBy ?? undefined}
      />
      <SelectField
        id="microchipLocation"
        name="microchipLocation"
        label="Ubicación en el cuerpo"
        defaultValue={existingPet?.microchipLocation ?? ""}
      >
        <option value="">No especificar</option>
        {MICROCHIP_LOCATIONS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

function CheckboxGroup({
  name,
  label,
  options,
  otherFieldName,
  defaultValues = [],
}: {
  name: string;
  label: string;
  options: readonly string[];
  otherFieldName: string;
  defaultValues?: readonly string[];
}) {
  // Anything in defaultValues that isn't in `options` becomes the initial
  // value of the "otros" field — preserves user-typed extras across edits.
  const optionsSet = new Set(options);
  const otherDefaultValue = defaultValues.filter((v) => !optionsSet.has(v)).join(", ");

  return (
    <div className="space-y-2">
      <span className={labelClass}>{label}</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {options.map((opt) => (
          <label
            key={opt}
            className="flex items-center gap-2 text-sm text-gob-text  cursor-pointer"
          >
            <input
              type="checkbox"
              name={name}
              value={opt}
              defaultChecked={defaultValues.includes(opt)}
              className="rounded border-gob-border-strong  text-gob-text  focus:ring-gob-primary "
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
      <input
        id={otherFieldName}
        name={otherFieldName}
        type="text"
        placeholder="Otros (separá por coma si querés varios)"
        defaultValue={otherDefaultValue}
        className={`${inputClass} mt-1 text-sm`}
      />
    </div>
  );
}

function PhotoField({
  onFileChange,
  preview,
}: {
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  preview: string | null;
}) {
  return (
    <div className="space-y-2">
      <span className={labelClass}>Foto (opcional)</span>
      <label
        htmlFor="photo"
        className="flex items-center gap-4 p-3 rounded-lg border border-dashed border-gob-border-strong  cursor-pointer hover:bg-gob-surface-alt  transition-colors"
      >
        {preview ? (
          <img
            src={preview}
            alt="Vista previa de la mascota"
            className="w-20 h-20 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-lg bg-gob-surface-alt  flex items-center justify-center text-gob-text-muted  text-xs text-center px-2 shrink-0">
            Sin foto
          </div>
        )}
        <div className="flex-1 text-sm text-gob-text-gray ">
          {preview ? "Cambiar foto" : "Tocá para elegir una foto"}
          <p className="text-xs text-gob-text-muted  mt-1">JPG o PNG, hasta 5 MB</p>
        </div>
      </label>
      <input
        id="photo"
        name="photo"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        className="sr-only"
      />
    </div>
  );
}

function Field({
  id,
  name,
  type,
  label,
  autoComplete,
  required,
  defaultValue,
  step,
  min,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string | number;
  step?: string;
  min?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="text-gob-danger ml-0.5">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        step={step}
        min={min}
        className={inputClass}
      />
    </div>
  );
}

function SelectField({
  id,
  name,
  label,
  required,
  value,
  onChange,
  defaultValue,
  children,
}: {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  const controlled = value !== undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="text-gob-danger ml-0.5">*</span>}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        {...(controlled ? { value, onChange } : { defaultValue: defaultValue ?? "" })}
        className={inputClass}
      >
        {children}
      </select>
    </div>
  );
}
