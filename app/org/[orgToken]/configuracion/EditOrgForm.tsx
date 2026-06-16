"use client";

import { useActionState, useState } from "react";

import { LnAlert } from "@/components/ui/Alert";
import { LnButton } from "@/components/ui/Button";
import { LnCheckbox, LnField, LnInput } from "@/components/ui/Field";
import type { Organization } from "@/db";
import {
  type UpdateOrgFormState,
  updateOrganizationAction,
} from "@/src/modules/organizations/actions";

type Props = {
  organization: Pick<
    Organization,
    | "publicToken"
    | "displayName"
    | "legalName"
    | "email"
    | "phone"
    | "website"
    | "description"
    | "personeriaJuridicaNumber"
    | "tier0ShowOriginOrg"
  >;
};

const initialState: UpdateOrgFormState = { error: null };

export function EditOrgForm({ organization }: Props) {
  const [state, formAction, isPending] = useActionState(updateOrganizationAction, initialState);

  // Controlled field state — preserves typed input on validation error.
  const [displayName, setDisplayName] = useState(organization.displayName);
  const [legalName, setLegalName] = useState(organization.legalName ?? "");
  const [email, setEmail] = useState(organization.email ?? "");
  const [phone, setPhone] = useState(organization.phone ?? "");
  const [website, setWebsite] = useState(organization.website ?? "");
  const [description, setDescription] = useState(organization.description ?? "");
  const [personeriaJuridicaNumber, setPersoneriaJuridicaNumber] = useState(
    organization.personeriaJuridicaNumber ?? "",
  );

  return (
    <form action={formAction} className="space-y-5 max-w-xl">
      {/* Hidden field so the action knows which org to update */}
      <input type="hidden" name="orgToken" value={organization.publicToken} />

      <LnField label="Nombre público" required hint="Nombre que verán los demás usuarios de MiMAR.">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="displayName"
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField
        label="Razón social"
        hint="Nombre legal completo (ej: Asoc. Civil Refugio El Campito)."
      >
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="legalName"
            type="text"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="Correo electrónico de contacto">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="Teléfono">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="Sitio web" hint="Debe comenzar con http:// o https://">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="Descripción pública" hint="Máximo 2000 caracteres.">
        {({ id, describedBy }) => (
          <textarea
            id={id}
            name="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-describedby={describedBy}
            className="w-full rounded-[6px] border border-ln-op-line px-3 py-2 text-[13px] text-ln-op-ink bg-ln-op-card focus:outline-none focus:ring-1 focus:ring-ln-op-azul resize-y"
          />
        )}
      </LnField>

      <LnField label="Número de personería jurídica">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="personeriaJuridicaNumber"
            type="text"
            value={personeriaJuridicaNumber}
            onChange={(e) => setPersoneriaJuridicaNumber(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <div className="space-y-1">
        <LnCheckbox
          name="tier0ShowOriginOrg"
          value="true"
          defaultChecked={organization.tier0ShowOriginOrg}
        >
          Mostrar a mi organización como refugio de origen en la credencial pública de las mascotas
        </LnCheckbox>
        <p className="text-[12px] text-ln-op-mute pl-6">
          Cuando está activo, la credencial pública muestra el nombre de tu organización como
          refugio de origen de la mascota.
        </p>
      </div>

      {state.error && <LnAlert variant="danger">{state.error}</LnAlert>}
      {state.ok && <LnAlert variant="success">Cambios guardados correctamente.</LnAlert>}

      <LnButton type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar cambios"}
      </LnButton>
    </form>
  );
}
