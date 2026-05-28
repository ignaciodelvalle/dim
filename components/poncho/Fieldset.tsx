// Fieldset: wrapper de <legend> + grupo de controles + help/error.
//
// Es la versión "grupal" de <Field>. Mientras <Field> rinde un <label>
// que apunta a un control único, <Fieldset> usa el par nativo
// <fieldset><legend> que es la forma accesible canónica de agrupar
// checkboxes/radios o cualquier conjunto de controles relacionados.
//
// El help/error se cablea con aria-describedby en el propio <fieldset>,
// que los lectores de pantalla anuncian al enfocar cualquier control
// hijo.
//
// Uso típico (radios):
//   <Fieldset legend="Procedimiento" required help="Elegí una opción"
//             error={state.error ?? undefined}>
//     <Radio name="procedure" value="castration" required>Castración</Radio>
//     <Radio name="procedure" value="spay">Ovariectomía</Radio>
//   </Fieldset>
//
// Uso típico (checkbox standalone — Términos):
//   <Fieldset legend="Términos y condiciones" error={state.termsError}>
//     <Checkbox name="terms" required>Acepto los términos</Checkbox>
//   </Fieldset>
//
// Si solo querés un checkbox sin grupo y sin legend visible, usá <Checkbox>
// directo sin <Fieldset>.

import { type ReactNode, useId } from "react";

export type FieldsetProps = {
  legend: string;
  help?: string;
  error?: string;
  /** Mostrá una marca de opcional al lado del legend. Default: !required */
  optional?: boolean;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

export function Fieldset({
  legend,
  help,
  error,
  optional,
  required,
  className,
  children,
}: FieldsetProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const showOptional = optional ?? !required;

  return (
    <fieldset
      className={`mb-7 border-0 p-0 m-0 ${className ?? ""}`.trim()}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
    >
      <legend className="block mb-2.5 text-[0.88em] font-semibold text-gob-text-muted">
        {legend}
        {required && (
          <span className="ml-1 text-gob-danger" aria-hidden="true">
            *
          </span>
        )}
        {showOptional && (
          <span className="ml-1 text-xs font-normal text-gob-text-muted">(opcional)</span>
        )}
      </legend>
      <div className="flex flex-col gap-2">{children}</div>
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
    </fieldset>
  );
}
