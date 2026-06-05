"use client";

import { useActionState } from "react";

import { type UpdateOrgFormState, updateOrganizationAction } from "@/app/actions/organizations";
import { Alert, Button, Field, Input } from "@/components/poncho";
import type { Organization } from "@/db";

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
  >;
};

const initialState: UpdateOrgFormState = { error: null };

export function EditOrgForm({ organization }: Props) {
  const [state, formAction, isPending] = useActionState(updateOrganizationAction, initialState);

  return (
    <form action={formAction} className="space-y-5 max-w-xl">
      {/* Hidden field so the action knows which org to update */}
      <input type="hidden" name="orgToken" value={organization.publicToken} />

      <Field label="Nombre público" required help="Nombre que verán los demás usuarios de MiMAR.">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="displayName"
            type="text"
            required
            defaultValue={organization.displayName}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field
        label="Razón social"
        help="Nombre legal completo (ej: Asoc. Civil Refugio El Campito)."
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="legalName"
            type="text"
            defaultValue={organization.legalName ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Correo electrónico de contacto">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="email"
            type="email"
            defaultValue={organization.email ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Teléfono">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="phone"
            type="tel"
            defaultValue={organization.phone ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Sitio web" help="Debe comenzar con http:// o https://">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="website"
            type="url"
            defaultValue={organization.website ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Descripción pública" help="Máximo 2000 caracteres.">
        {({ id, describedBy }) => (
          <textarea
            id={id}
            name="description"
            rows={4}
            defaultValue={organization.description ?? ""}
            aria-describedby={describedBy}
            className="w-full rounded-lg border border-gob-border px-3 py-2 text-sm text-gob-text bg-white focus:outline-none focus:ring-2 focus:ring-gob-primary focus:border-transparent resize-y"
          />
        )}
      </Field>

      <Field label="Número de personería jurídica">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="personeriaJuridicaNumber"
            type="text"
            defaultValue={organization.personeriaJuridicaNumber ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {state.error && <Alert variant="danger">{state.error}</Alert>}
      {state.ok && <Alert variant="success">Cambios guardados correctamente.</Alert>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}
