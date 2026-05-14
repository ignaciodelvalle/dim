"use client";

import { useActionState, useState } from "react";
import { createPetAction, type NewPetFormState } from "@/app/actions/pets";

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

export function NewPetForm() {
  const [state, formAction, isPending] = useActionState(createPetAction, initialState);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    if (file) {
      setPhotoPreview(URL.createObjectURL(file));
    } else {
      setPhotoPreview(null);
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <PhotoField onFileChange={handlePhotoChange} preview={photoPreview} />

      <Field id="name" name="name" type="text" label="Nombre" required autoComplete="off" />

      <SelectField id="species" name="species" label="Especie" required>
        <option value="">Elegí una</option>
        <option value="dog">Perro</option>
        <option value="cat">Gato</option>
        <option value="other">Otra</option>
      </SelectField>

      <SelectField id="sex" name="sex" label="Sexo" required>
        <option value="unknown">No sé</option>
        <option value="male">Macho</option>
        <option value="female">Hembra</option>
      </SelectField>

      <Field
        id="dateOfBirth"
        name="dateOfBirth"
        type="date"
        label="Fecha de nacimiento (aproximada)"
      />

      <Field id="color" name="color" type="text" label="Color / marcas" />

      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-5">
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Ubicación (opcional, ayuda a las campañas de salud animal).
        </p>
        <SelectField id="province" name="province" label="Provincia">
          <option value="">No especificar</option>
          {PROVINCIAS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </SelectField>
        <Field id="locality" name="locality" type="text" label="Barrio o localidad" />
      </div>

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
        {isPending ? "Guardando..." : "Crear mascota"}
      </button>
    </form>
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
          // biome-ignore lint/a11y/useAltText: preview only — server-side has full alt
          <img
            src={preview}
            alt="Vista previa"
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
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-900 dark:text-neutral-50">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
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
  children,
}: {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-900 dark:text-neutral-50">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue=""
        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
      >
        {children}
      </select>
    </div>
  );
}
