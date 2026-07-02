"use client";

// EmergencyContactFields — the 4-field vet/emergency-contact group, shared
// by two hosts (pet-document-redesign ADR-13, Phase 5):
//   1. app/(app)/cuenta/editar/EditProfileForm.tsx (full profile edit form)
//   2. app/(app)/mis-mascotas/[publicToken]/_emergencia/EmergencyContactSheet.tsx
//      (`?sheet=emergencia` — narrow in-profile edit, ADR-13)
//
// Extracted verbatim from EditProfileForm (~L278-362) — same fieldset,
// labels, placeholders, and PhoneFormatWarning behavior. Controlled: the
// host owns the state (useState in EditProfileForm; a small local state in
// the sheet) and passes `values` + a single `onChange(field, value)`.

import { looksLikeArPhone } from "@/lib/reference/ar-phone";

export type EmergencyContactValues = {
  preferredVetName: string;
  preferredVetPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

type Props = {
  values: EmergencyContactValues;
  onChange: (field: keyof EmergencyContactValues, value: string) => void;
  /** Renders the surrounding <fieldset>/legend/intro copy. Default: true. */
  framed?: boolean;
};

function PhoneFormatWarning({ value }: { value: string }) {
  if (!value || looksLikeArPhone(value)) return null;
  return (
    <p className="mt-1 text-xs text-[var(--color-ln-warn)]">
      Formato inusual para Argentina — guardamos igual, revisalo si querés.
    </p>
  );
}

function FieldsGrid({ values, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label
          htmlFor="preferredVetName"
          className="block text-xs font-medium text-[var(--color-ln-ink-2)] mb-1"
        >
          Veterinario/a de cabecera
        </label>
        <input
          id="preferredVetName"
          type="text"
          value={values.preferredVetName}
          onChange={(e) => onChange("preferredVetName", e.target.value)}
          maxLength={80}
          placeholder="Dra. Pérez"
          className="w-full text-sm rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-3 py-2 outline-none focus:border-[var(--color-ln-azul)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]"
        />
      </div>
      <div>
        <label
          htmlFor="preferredVetPhone"
          className="block text-xs font-medium text-[var(--color-ln-ink-2)] mb-1"
        >
          Teléfono del vet
        </label>
        <input
          id="preferredVetPhone"
          type="tel"
          value={values.preferredVetPhone}
          onChange={(e) => onChange("preferredVetPhone", e.target.value)}
          placeholder="+54 9 11 1234-5678"
          className="w-full text-sm rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-3 py-2 outline-none focus:border-[var(--color-ln-azul)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]"
        />
        <PhoneFormatWarning value={values.preferredVetPhone} />
      </div>
      <div>
        <label
          htmlFor="emergencyContactName"
          className="block text-xs font-medium text-[var(--color-ln-ink-2)] mb-1"
        >
          Contacto de emergencia
        </label>
        <input
          id="emergencyContactName"
          type="text"
          value={values.emergencyContactName}
          onChange={(e) => onChange("emergencyContactName", e.target.value)}
          maxLength={80}
          placeholder="Lucía F."
          className="w-full text-sm rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-3 py-2 outline-none focus:border-[var(--color-ln-azul)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]"
        />
      </div>
      <div>
        <label
          htmlFor="emergencyContactPhone"
          className="block text-xs font-medium text-[var(--color-ln-ink-2)] mb-1"
        >
          Teléfono del contacto
        </label>
        <input
          id="emergencyContactPhone"
          type="tel"
          value={values.emergencyContactPhone}
          onChange={(e) => onChange("emergencyContactPhone", e.target.value)}
          placeholder="+54 9 11 1234-5678"
          className="w-full text-sm rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-3 py-2 outline-none focus:border-[var(--color-ln-azul)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]"
        />
        <PhoneFormatWarning value={values.emergencyContactPhone} />
      </div>
    </div>
  );
}

export function EmergencyContactFields({ values, onChange, framed = true }: Props) {
  if (!framed) return <FieldsGrid values={values} onChange={onChange} />;

  return (
    <fieldset
      id="emergencia"
      className="scroll-mt-6 space-y-3 rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] p-4"
    >
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ln-mute)]">
        Contactos para emergencias
      </legend>
      <p className="text-xs text-[var(--color-ln-mute)]">
        Aparecen en la credencial de cada mascota. Si una mascota está perdida y un finder escanea
        el QR, podemos mostrarle estos contactos (según tus preferencias de privacidad).
      </p>
      <FieldsGrid values={values} onChange={onChange} />
    </fieldset>
  );
}
