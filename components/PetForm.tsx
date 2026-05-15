"use client";

// Shared pet form. Used by both /mis-mascotas/nueva (create) and
// /mis-mascotas/[token]/editar (edit). Mode is determined by the `existingPet`
// prop — present means edit, absent means create. The action prop is bound
// at the call site so the form doesn't need to know which it's calling.

import type { NewPetFormState } from "@/app/actions/pets";
import type { Pet } from "@/db";
import { breedsForSpecies, isPotentiallyDangerousBreed } from "@/lib/breeds";
import {
  COMMON_ALLERGIES,
  COMMON_FOODS,
  INSURANCE_COMPANIES,
  MICROCHIP_LOCATIONS,
  TRAINING_LEVELS,
} from "@/lib/lookups";
import { useActionState, useMemo, useState } from "react";

const initialState: NewPetFormState = { error: null };

const PROVINCIAS = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

type FormAction = (prev: NewPetFormState, formData: FormData) => Promise<NewPetFormState>;

export function PetForm({
  action,
  existingPet,
  existingPhotoUrl,
}: {
  action: FormAction;
  existingPet?: Pet;
  existingPhotoUrl?: string | null;
}) {
  const isEdit = !!existingPet;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [photoPreview, setPhotoPreview] = useState<string | null>(existingPhotoUrl ?? null);
  const [species, setSpecies] = useState<string>(existingPet?.species ?? "");
  const [breed, setBreed] = useState<string>(existingPet?.breed ?? "");

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

        <SelectField
          id="species"
          name="species"
          label="Especie"
          required
          value={species}
          onChange={(e) => {
            setSpecies(e.target.value);
            setBreed("");
          }}
        >
          <option value="">Elegí una</option>
          <option value="dog">Perro</option>
          <option value="cat">Gato</option>
          <option value="other">Otra</option>
        </SelectField>

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

      {/* SECTION: Identificación y raza */}
      <Section title="Identificación y raza" defaultOpen={isEdit && !!existingPet?.breed}>
        <div className="space-y-1.5">
          <label
            htmlFor="breed"
            className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
          >
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
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent disabled:opacity-50"
          />
          <datalist id="breed-options">
            {breedOptions.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          {breedIsDangerous && (
            <div className="mt-2 p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200">
              Esta raza está en el registro de razas potencialmente peligrosas (Ley CABA 4078, Ley
              Provincial 14.107). Vas a tener que registrarte en el registro provincial
              correspondiente. DIM marcará tu mascota con la flag oficial y te avisará en
              notificaciones.
            </div>
          )}
        </div>

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
          <label
            htmlFor="insuranceCompany"
            className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
          >
            Compañía
          </label>
          <input
            id="insuranceCompany"
            name="insuranceCompany"
            type="text"
            list="insurance-companies"
            placeholder="Buscar o tipear…"
            defaultValue={existingPet?.insuranceCompany ?? undefined}
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
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
        <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-center text-sm text-neutral-500 dark:text-neutral-500">
          Pasaporte de viaje, certificado de perro de servicio, otros.
          <br />
          <span className="text-xs">Próximamente</span>
        </div>
      </Section>

      {/* SECTION: Smart devices */}
      <Section title="Dispositivos conectados">
        <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-center space-y-3">
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            Cámaras, comederos automáticos, collares GPS, sensores.
          </p>
          <button
            type="button"
            disabled
            className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-500 disabled:cursor-not-allowed"
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
        <SelectField
          id="province"
          name="province"
          label="Provincia"
          defaultValue={existingPet?.jurisdictionProvince ?? ""}
        >
          <option value="">No especificar</option>
          {PROVINCIAS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </SelectField>
        <Field
          id="locality"
          name="locality"
          type="text"
          label="Barrio o localidad"
          defaultValue={existingPet?.jurisdictionLocality ?? undefined}
        />
      </Section>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear mascota"}
      </button>
    </form>
  );
}

// ============================================================================
// Helpers
// ============================================================================

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
    <details
      open={defaultOpen}
      className="group rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
    >
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-neutral-900 dark:text-neutral-50 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-900 rounded-lg">
        <span>{title}</span>
        <span className="text-neutral-400 dark:text-neutral-600 group-open:rotate-90 transition-transform">
          ›
        </span>
      </summary>
      <div className="p-4 pt-2 space-y-4 border-t border-neutral-200 dark:border-neutral-800">
        {children}
      </div>
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
      <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-50">
        Edad aproximada
      </span>
      <div className="grid grid-cols-2 gap-3">
        <input
          id="ageYears"
          name="ageYears"
          type="number"
          min="0"
          max="40"
          placeholder="Años"
          defaultValue={defaultYears ?? undefined}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
        <input
          id="ageMonths"
          name="ageMonths"
          type="number"
          min="0"
          max="11"
          placeholder="Meses"
          defaultValue={defaultMonths ?? undefined}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-500">
        Si no sabés exacto, una estimación está bien.
      </p>
    </div>
  );
}

function MicrochipBlock({ existingPet }: { existingPet?: Pet }) {
  return (
    <div className="space-y-3 pt-3 border-t border-neutral-100 dark:border-neutral-900">
      <p className="text-xs text-neutral-500 dark:text-neutral-500 uppercase tracking-wider">
        Microchip
      </p>
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
      <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-50">
        {label}
      </span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {options.map((opt) => (
          <label
            key={opt}
            className="flex items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200 cursor-pointer"
          >
            <input
              type="checkbox"
              name={name}
              value={opt}
              defaultChecked={defaultValues.includes(opt)}
              className="rounded border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-50 focus:ring-neutral-900 dark:focus:ring-neutral-50"
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
        className="w-full mt-1 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
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
      <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-50">
        Foto (opcional)
      </span>
      <label
        htmlFor="photo"
        className="flex items-center gap-4 p-3 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
      >
        {preview ? (
          <img
            src={preview}
            alt="Vista previa de la mascota"
            className="w-20 h-20 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-lg bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-neutral-400 dark:text-neutral-600 text-xs text-center px-2 shrink-0">
            Sin foto
          </div>
        )}
        <div className="flex-1 text-sm text-neutral-600 dark:text-neutral-400">
          {preview ? "Cambiar foto" : "Tocá para elegir una foto"}
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
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
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
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
        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
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
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        {...(controlled ? { value, onChange } : { defaultValue: defaultValue ?? "" })}
        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
      >
        {children}
      </select>
    </div>
  );
}
