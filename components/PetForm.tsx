"use client";

// Shared pet form. Used by both /mis-mascotas/nueva (create) and
// /mis-mascotas/[token]/editar (edit). Mode is determined by the `existingPet`
// prop — present means edit, absent means create. The action prop is bound
// at the call site so the form doesn't need to know which it's calling.
//
// Redesigned with Libreta Nacional design system (blue accordions, §11 handoff).
// Server action, useActionState wiring, field names, and submit logic: untouched.

import { LnSheetAccordion } from "@/components/ui/Sheet";
import { LnField, LnInput, LnSelect } from "@/components/ui/Field";
import { LnCallout } from "@/components/ui/DocElements";
import { LnChip, LnChipGroup } from "@/components/ui/Chip";
import { LnToggle } from "@/components/ui/Toggle";
import type { Pet } from "@/db";
import { provinceByName } from "@/lib/ar-provincias";
import { breedsForSpecies, isPotentiallyDangerousBreed } from "@/lib/breeds";
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
import type { NewPetFormState } from "@/src/modules/pets/domain/types";
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
  compact?: boolean;
  submitLabel?: string;
  pendingLabel?: string;
  hiddenFields?: Record<string, string>;
}) {
  const isEdit = !!existingPet;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [photoPreview, setPhotoPreview] = useState<string | null>(existingPhotoUrl ?? null);
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
  const [emergencyInfoVisible, setEmergencyInfoVisible] = useState<boolean>(
    existingPet?.emergencyInfoVisible ?? false,
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

  // Allergy chips state (LnChipGroup)
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>(
    existingPet?.knownAllergies ?? [],
  );
  const [selectedFoods, setSelectedFoods] = useState<string[]>(
    existingPet?.favouriteFoods ?? [],
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

  // Determine which accordions are "complete" (have data filled in).
  const basicComplete = !!(species && (existingPet?.name || !isEdit));
  const identComplete = !!(breed || existingPet?.microchipId);
  const healthComplete = !!(selectedAllergies.length || selectedFoods.length || conditions.size);

  return (
    <form action={formAction} className="flex flex-col gap-[10px]">
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      {/* Custody toggle — only on create, not compact */}
      {!compact && !isEdit && <CustodyKindToggle value={custodyKind} onChange={setCustodyKind} />}

      {/* Photo — always visible above the accordions */}
      <LnPhotoField onFileChange={handlePhotoChange} preview={photoPreview} />

      {/* ── 01 Lo básico ─────────────────────────────────── */}
      <LnSheetAccordion
        num="01"
        title="Lo básico"
        defaultOpen
        complete={basicComplete}
      >
        <div className="flex flex-col gap-[12px]">
          <LnField label="Nombre" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="name"
                type="text"
                required
                autoComplete="off"
                defaultValue={existingPet?.name}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>

          <input type="hidden" name="species" value={species} />
          <LnField label="Especie" required>
            {({ id, describedBy, invalid }) => (
              <LnSelect
                id={id}
                name="speciesGroup"
                required
                value={speciesGroup}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === "dog" || next === "cat") {
                    setSpecies(next);
                  } else if (next === "other") {
                    setSpecies("");
                  } else {
                    setSpecies("");
                  }
                  setBreed("");
                }}
                aria-describedby={describedBy}
                invalid={invalid}
              >
                <option value="">Elegí una</option>
                <option value="dog">Perro</option>
                <option value="cat">Gato</option>
                <option value="other">Otra</option>
              </LnSelect>
            )}
          </LnField>
          {speciesGroup === "other" && (
            <LnField label='Tipo de "Otra"' required>
              {({ id, describedBy, invalid }) => (
                <LnSelect
                  id={id}
                  name="speciesSubgroup"
                  required
                  value={subSpecies}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSpecies(next === "other_unlisted" ? "other" : next);
                    setBreed("");
                  }}
                  aria-describedby={describedBy}
                  invalid={invalid}
                >
                  <option value="">Elegí una</option>
                  <option value="rabbit">Conejo</option>
                  <option value="guinea_pig">Cobayo</option>
                  <option value="ferret">Hurón</option>
                  <option value="other_unlisted">Otro / no listado</option>
                </LnSelect>
              )}
            </LnField>
          )}

          <LnField label="Sexo" required>
            {({ id, describedBy, invalid }) => (
              <LnSelect
                id={id}
                name="sex"
                required
                defaultValue={existingPet?.sex ?? "unknown"}
                aria-describedby={describedBy}
                invalid={invalid}
              >
                <option value="unknown">No sé</option>
                <option value="male">Macho</option>
                <option value="female">Hembra</option>
              </LnSelect>
            )}
          </LnField>

          <LnAgeFields defaultYears={initialAge.years} defaultMonths={initialAge.months} />

          <LnField label="Color / marcas">
            {({ id, describedBy }) => (
              <LnInput
                id={id}
                name="color"
                type="text"
                defaultValue={existingPet?.color ?? undefined}
                aria-describedby={describedBy}
              />
            )}
          </LnField>
        </div>
      </LnSheetAccordion>

      {!compact && (
        <>
          {/* ── 02 Identificación y raza ──────────────────────── */}
          <LnSheetAccordion
            num="02"
            title="Identificación y raza"
            defaultOpen={isEdit && !!existingPet?.breed}
            complete={identComplete}
          >
            <div className="flex flex-col gap-[12px]">
              <LnField label="Raza">
                {({ id, describedBy }) => (
                  <LnInput
                    id={id}
                    name="breed"
                    type="text"
                    list="breed-options"
                    value={breed}
                    onChange={(e) => setBreed(e.target.value)}
                    placeholder={species ? "Empezá a tipear o elegí…" : "Elegí especie primero"}
                    disabled={!species}
                    aria-describedby={describedBy}
                  />
                )}
              </LnField>
              <datalist id="breed-options">
                {breedOptions.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>

              {breedIsDangerous && (
                <LnCallout tone="warn" title="Raza potencialmente peligrosa">
                  Esta raza está en el registro de razas potencialmente peligrosas (Ley CABA 4078,
                  Ley Provincial 14.107). Registrate en el registro provincial correspondiente.
                </LnCallout>
              )}

              <LnField
                label={
                  isEdit
                    ? `¿Cómo llegó ${existingPet?.name ?? "tu mascota"}?`
                    : "¿Cómo te encontraste con esta mascota?"
                }
              >
                {({ id, describedBy, invalid }) => (
                  <LnSelect
                    id={id}
                    name="acquisitionMethod"
                    defaultValue={existingPet?.acquisitionMethod ?? ""}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  >
                    <option value="">No especificar</option>
                    <option value="adopted">Adoptado/a</option>
                    <option value="purchased">Comprado/a</option>
                    <option value="found_stray">Encontrado/a en la calle</option>
                    <option value="gift">Regalado/a</option>
                    <option value="born_in_litter">Nacido/a en casa (camada propia)</option>
                    <option value="other">Otro</option>
                  </LnSelect>
                )}
              </LnField>

              <MicrochipBlock existingPet={existingPet} />
            </div>
          </LnSheetAccordion>

          {/* ── 03 Salud y vida diaria ───────────────────────── */}
          <LnSheetAccordion
            num="03"
            title="Salud y vida diaria"
            complete={healthComplete}
          >
            <div className="flex flex-col gap-[12px]">
              <LnField label="Peso estimado" hint="En kilogramos.">
                {({ id, describedBy }) => (
                  <LnInput
                    id={id}
                    name="estimatedWeightKg"
                    type="number"
                    step="0.1"
                    min="0"
                    defaultValue={existingPet?.estimatedWeightKg ?? undefined}
                    aria-describedby={describedBy}
                  />
                )}
              </LnField>

              <div className="flex flex-col gap-[6px]">
                <p className="font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.12em] text-[var(--color-ln-faint)]">
                  Comidas favoritas
                </p>
                {/* Hidden multi-value inputs for selected foods */}
                {selectedFoods.map((f) => (
                  <input key={f} type="hidden" name="favouriteFoods" value={f} />
                ))}
                <LnChipGroup
                  items={COMMON_FOODS.map((f) => ({ key: f, label: f }))}
                  selected={selectedFoods}
                  onChange={setSelectedFoods}
                />
                <LnInput
                  name="favouriteFoodsOther"
                  type="text"
                  placeholder="Otros (separá por coma si querés varios)"
                  defaultValue={
                    (existingPet?.favouriteFoods ?? [])
                      .filter((v) => !new Set(COMMON_FOODS).has(v))
                      .join(", ")
                  }
                />
              </div>

              <div className="flex flex-col gap-[6px]">
                <p className="font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.12em] text-[var(--color-ln-faint)]">
                  Alergias conocidas
                </p>
                {selectedAllergies.map((a) => (
                  <input key={a} type="hidden" name="knownAllergies" value={a} />
                ))}
                <LnChipGroup
                  items={COMMON_ALLERGIES.map((a) => ({ key: a, label: a, tone: "rojo" as const }))}
                  selected={selectedAllergies}
                  onChange={setSelectedAllergies}
                />
                <LnInput
                  name="knownAllergiesOther"
                  type="text"
                  placeholder="Otros (separá por coma si querés varios)"
                  defaultValue={
                    (existingPet?.knownAllergies ?? [])
                      .filter((v) => !new Set(COMMON_ALLERGIES).has(v))
                      .join(", ")
                  }
                />
              </div>

              <LnField label="Nivel de entrenamiento">
                {({ id, describedBy, invalid }) => (
                  <LnSelect
                    id={id}
                    name="trainingLevel"
                    defaultValue={existingPet?.trainingLevel ?? ""}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  >
                    <option value="">No especificar</option>
                    {TRAINING_LEVELS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </LnSelect>
                )}
              </LnField>
            </div>
          </LnSheetAccordion>

          {/* ── 04 Condiciones permanentes ───────────────────── */}
          <LnSheetAccordion
            num="04"
            title="Condiciones permanentes"
            defaultOpen={isEdit && conditions.size > 0}
            complete={conditions.size > 0}
          >
            <div className="flex flex-col gap-[12px]">
              <p className="text-[12px] text-[var(--color-ln-mute)]">
                Marcá si tu mascota convive con alguna condición de por vida (sentidos, motora,
                médica).
              </p>
              <input
                type="hidden"
                name="permanentConditions"
                value={Array.from(conditions).join(",")}
              />
              <div className="flex flex-col gap-[10px]">
                {PERMANENT_CONDITION_GROUPS.map((group) => {
                  const codes = PERMANENT_CONDITIONS.filter(
                    (c) => permanentConditionGroup(c) === group.id,
                  );
                  if (codes.length === 0) return null;
                  return (
                    <div key={group.id} className="flex flex-col gap-[6px]">
                      <p className="font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-faint)]">
                        {group.label}
                      </p>
                      <div className="flex flex-wrap gap-[6px]">
                        {codes.map((code) => (
                          <LnChip
                            key={code}
                            selected={conditions.has(code)}
                            onChange={() => toggleCondition(code)}
                          >
                            {permanentConditionLabel(code)}
                          </LnChip>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {conditions.has("otra") && (
                <LnField label="Especificá la condición" required>
                  {({ id, describedBy, invalid }) => (
                    <LnInput
                      id={id}
                      name="permanentConditionsOther"
                      type="text"
                      required
                      maxLength={120}
                      value={conditionsOther}
                      onChange={(e) => setConditionsOther(e.target.value)}
                      aria-describedby={describedBy}
                      invalid={invalid}
                    />
                  )}
                </LnField>
              )}
              {!conditions.has("otra") && (
                <input type="hidden" name="permanentConditionsOther" value="" />
              )}
              <LnToggle
                variant="azul"
                checked={discloseConditions}
                onChange={(v) => {
                  setDiscloseConditions(v);
                }}
                label="Compartir estas condiciones en superficies públicas"
                description="Cuando está marcado, se muestran en la credencial pública y en /adoptar si el refugio publica al pet."
              />
              <input
                type="hidden"
                name="discloseConditionsPublicly"
                value={discloseConditions ? "true" : ""}
              />
            </div>
          </LnSheetAccordion>

          {/* ── 05 Credencial pública ────────────────────────── */}
          <LnSheetAccordion
            num="05"
            title="Credencial pública"
            defaultOpen={isEdit && !!existingPet?.emergencyInfoVisible}
            complete={emergencyInfoVisible}
          >
            <div className="flex flex-col gap-[10px]">
              <LnToggle
                variant="azul"
                checked={emergencyInfoVisible}
                onChange={(v) => setEmergencyInfoVisible(v)}
                label="Mostrar aviso de emergencia médica en la credencial pública"
                description="Aparece en la página pública sin revelar tu nombre ni datos sensibles."
              />
              <input
                type="hidden"
                name="emergencyInfoVisible"
                value={emergencyInfoVisible ? "true" : ""}
              />
            </div>
          </LnSheetAccordion>

          {/* Remaining sections (seguro, documentos, dispositivos, ubicación) */}
          <LnSheetAccordion num="06" title="Seguro de mascota">
            <div className="flex flex-col gap-[12px]">
              <LnField label="Compañía">
                {({ id, describedBy }) => (
                  <LnInput
                    id={id}
                    name="insuranceCompany"
                    type="text"
                    list="insurance-companies"
                    placeholder="Buscar o tipear…"
                    defaultValue={existingPet?.insuranceCompany ?? undefined}
                    aria-describedby={describedBy}
                  />
                )}
              </LnField>
              <datalist id="insurance-companies">
                {INSURANCE_COMPANIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <LnField label="Número de póliza">
                {({ id, describedBy }) => (
                  <LnInput
                    id={id}
                    name="insurancePolicyNumber"
                    type="text"
                    mono
                    defaultValue={existingPet?.insurancePolicyNumber ?? undefined}
                    aria-describedby={describedBy}
                  />
                )}
              </LnField>
            </div>
          </LnSheetAccordion>

          <LnSheetAccordion num="07" title="Ubicación">
            <div className="flex flex-col gap-[12px]">
              <p className="text-[12px] text-[var(--color-ln-mute)]">
                Ayuda a las campañas de salud animal regionales.
              </p>
              <LocationFields
                mode="l1"
                defaultValue={{
                  provinceCode: provinceByName(existingPet?.jurisdictionProvince)?.code ?? null,
                  localityName: existingPet?.jurisdictionLocality ?? null,
                }}
              />
            </div>
          </LnSheetAccordion>
        </>
      )}

      {state.error && (
        <p
          className="font-[var(--font-ln-mono)] text-[11.5px] text-[var(--color-ln-err)]"
          role="alert"
        >
          {state.error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className={[
          "inline-flex w-full cursor-pointer items-center justify-center gap-[7px] rounded-[3px] border px-[16px] py-[10px] text-[13px] font-semibold text-white transition-colors",
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
            {pendingLabel ?? "Guardando..."}
          </>
        ) : (
          submitLabel ?? (isEdit ? "Guardar cambios" : "Crear mascota")
        )}
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
    <div className="flex flex-col gap-[10px]">
      <p className="font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
        ¿Es tu mascota o la estás cuidando?
      </p>
      <input type="hidden" name="custodyKind" value={value} />
      <div className="grid grid-cols-2 gap-[8px]">
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
          description="La encontraste, te la pasó alguien, o la tenés en tránsito."
        />
      </div>
      {value === "foster_in_transit" && (
        <p className="rounded-[4px] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] px-[12px] py-[10px] text-[12px] text-[var(--color-ln-ink-2)]">
          Vas a poder llevarle la libreta sanitaria mientras la cuidás. La información viaja
          con la mascota si aparece su familia o pasa a un refugio.
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
      className={[
        "rounded-[4px] border p-[12px] text-left transition-colors",
        checked
          ? "border-[var(--color-ln-azul)] bg-[var(--color-ln-celeste-050)]"
          : "border-[var(--color-ln-line)] bg-[var(--color-ln-card)] hover:bg-[var(--color-ln-stripe)]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-[13px] font-semibold text-[var(--color-ln-ink)]">{title}</p>
      <p className="mt-[3px] text-[11.5px] text-[var(--color-ln-mute)]">{description}</p>
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

function LnAgeFields({
  defaultYears,
  defaultMonths,
}: {
  defaultYears: number | null;
  defaultMonths: number | null;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <p className="font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
        Edad aproximada
      </p>
      <div className="grid grid-cols-2 gap-[10px]">
        <LnInput
          id="ageYears"
          name="ageYears"
          type="number"
          min="0"
          max="40"
          placeholder="Años"
          defaultValue={defaultYears ?? undefined}
        />
        <LnInput
          id="ageMonths"
          name="ageMonths"
          type="number"
          min="0"
          max="11"
          placeholder="Meses"
          defaultValue={defaultMonths ?? undefined}
        />
      </div>
      <p className="font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
        Si no sabés exacto, una estimación está bien.
      </p>
    </div>
  );
}

function MicrochipBlock({ existingPet }: { existingPet?: Pet }) {
  return (
    <div className="flex flex-col gap-[10px] border-t border-[var(--color-ln-line-2)] pt-[12px]">
      <p className="font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.12em] text-[var(--color-ln-faint)]">
        Microchip
      </p>
      <LnField label="Número de chip" hint="15 dígitos, ISO 11784/11785">
        {({ id, describedBy }) => (
          <LnInput
            id={id}
            name="microchipId"
            type="text"
            mono
            autoComplete="off"
            defaultValue={existingPet?.microchipId ?? undefined}
            aria-describedby={describedBy}
          />
        )}
      </LnField>
      <LnField label="Código de país">
        {({ id, describedBy }) => (
          <LnInput
            id={id}
            name="microchipCountryCode"
            type="text"
            mono
            defaultValue={existingPet?.microchipCountryCode ?? "858"}
            aria-describedby={describedBy}
          />
        )}
      </LnField>
      <LnField label="Fecha de implantación">
        {({ id, describedBy }) => (
          <LnInput
            id={id}
            name="microchipImplantedAt"
            type="date"
            mono
            defaultValue={existingPet?.microchipImplantedAt ?? undefined}
            aria-describedby={describedBy}
          />
        )}
      </LnField>
      <LnField label="Implantado por (vet / clínica)">
        {({ id, describedBy }) => (
          <LnInput
            id={id}
            name="microchipImplantedBy"
            type="text"
            defaultValue={existingPet?.microchipImplantedBy ?? undefined}
            aria-describedby={describedBy}
          />
        )}
      </LnField>
      <LnField label="Ubicación en el cuerpo">
        {({ id, describedBy, invalid }) => (
          <LnSelect
            id={id}
            name="microchipLocation"
            defaultValue={existingPet?.microchipLocation ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
          >
            <option value="">No especificar</option>
            {MICROCHIP_LOCATIONS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </LnSelect>
        )}
      </LnField>
    </div>
  );
}

function LnPhotoField({
  onFileChange,
  preview,
}: {
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  preview: string | null;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <p className="font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
        Foto{" "}
        <span className="font-normal lowercase tracking-[.04em] text-[var(--color-ln-faint)]">
          opcional
        </span>
      </p>
      <label
        htmlFor="photo"
        className="flex cursor-pointer items-center gap-[14px] rounded-[4px] border border-dashed border-[var(--color-ln-line-strong)] p-[12px] transition-colors hover:bg-[var(--color-ln-stripe)]"
      >
        {preview ? (
          <img
            src={preview}
            alt="Vista previa de la mascota"
            className="h-[72px] w-[72px] flex-shrink-0 rounded-[5px] object-cover"
          />
        ) : (
          <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center rounded-[5px] bg-[var(--color-ln-stripe)] text-[11px] text-[var(--color-ln-mute)]">
            Sin foto
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[var(--color-ln-ink-2)]">
            {preview ? "Cambiar foto" : "Tocá para elegir una foto"}
          </p>
          <p className="mt-[2px] font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
            JPG o PNG, hasta 5 MB
          </p>
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
