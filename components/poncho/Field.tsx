// Field: wrapper de label + control + help/error con aria-describedby auto-cableado.
//
// Patrón Poncho (alineado con _forms.scss): label arriba, control, help muted
// debajo, error en lugar del help cuando hay error. El control se inyecta vía
// children, así Field sirve para <Input>, <Textarea>, <Select> y cualquier
// control custom.
//
// Uso típico:
//   <Field label="Nombre" help="Mínimo 2 caracteres">
//     {({ id, describedBy, invalid }) => (
//       <Input id={id} aria-describedby={describedBy} invalid={invalid} />
//     )}
//   </Field>
//
// El render-prop entrega `id` derivado de useId(), `describedBy` que combina
// helpId + errorId, e `invalid` derivado de la presencia de `error`. Los
// hooks (useId) corren en Server Components, no agregar "use client".

import { type ReactNode, useId } from "react";

export type FieldRenderProps = {
  id: string;
  describedBy?: string;
  invalid: boolean;
};

export type FieldProps = {
  label: string;
  help?: string;
  error?: string;
  /** Mostrá una marca de opcional al lado del label. Default: !required */
  optional?: boolean;
  required?: boolean;
  className?: string;
  children: (api: FieldRenderProps) => ReactNode;
};

export function Field({ label, help, error, optional, required, className, children }: FieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const invalid = Boolean(error);
  const showOptional = optional ?? !required;

  return (
    <div className={`mb-7 ${className ?? ""}`.trim()}>
      <label htmlFor={id} className="block mb-2.5 text-[0.88em] font-semibold text-gob-text-muted">
        {label}
        {required && (
          <span className="ml-1 text-gob-danger" aria-hidden="true">
            *
          </span>
        )}
        {showOptional && (
          <span className="ml-1 text-xs font-normal text-gob-text-muted">(opcional)</span>
        )}
      </label>
      {children({ id, describedBy, invalid })}
      {help && !error && (
        <p id={helpId} className="mt-2 text-[0.77em] text-gob-text-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-2 text-[0.77em] text-gob-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
