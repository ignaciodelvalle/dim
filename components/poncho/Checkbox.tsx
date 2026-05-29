// Checkbox: native <input type="checkbox"> con look Poncho.
//
// El label viaja como children y el componente lo envuelve en un <label>
// nativo que comparte el id auto-generado por useId(). Esto significa que
// Checkbox es self-contained — no necesita <Field> envolviéndolo. Para un
// grupo de checkboxes (encuestas, listas de opciones), usar <Fieldset>:
//
//   <Fieldset legend="Vacunas" help="Marcá las aplicadas">
//     <Checkbox name="vaccines" value="rabies">Antirrábica</Checkbox>
//     <Checkbox name="vaccines" value="parvo">Parvovirus</Checkbox>
//   </Fieldset>
//
// Para un checkbox standalone (Términos y condiciones, etc.) basta con:
//
//   <Checkbox name="terms" required>Acepto los términos</Checkbox>
//
// Sin `children` el control es label-less: renderiza sólo el <input> (un <label>
// vacío no aporta nombre accesible). Pasá `aria-label` para nombrarlo — útil en
// selectores de fila de una lista, donde el contenido vive al lado del input:
//
//   <Checkbox checked={sel} onChange={toggle} aria-label="Seleccionar fila" />
//
// El prop `invalid` setea aria-invalid="true" — útil cuando un Fieldset
// padre tiene error y querés que cada control herede el estado visual.

import { type InputHTMLAttributes, type ReactNode, useId } from "react";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  invalid?: boolean;
  /** Label content. Omití para un control label-less (pasá `aria-label` en su lugar). */
  children?: ReactNode;
  /** Extra classes for the label text span — e.g. to tint confirmation copy with a warning/danger color. */
  labelClassName?: string;
};

export function Checkbox({
  invalid,
  children,
  className,
  labelClassName,
  id: idProp,
  ...rest
}: CheckboxProps) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const input = (
    <input
      id={id}
      type="checkbox"
      aria-invalid={invalid || undefined}
      className={`mt-0.5 h-4 w-4 shrink-0 accent-gob-primary ${className ?? ""}`.trim()}
      {...rest}
    />
  );
  // Label-less: a wrapping <label> with no text gives no accessible name, so
  // render just the input — the caller supplies aria-label and adjacent content.
  if (children == null) return input;
  return (
    <label htmlFor={id} className="flex items-start gap-2 cursor-pointer">
      {input}
      <span className={`text-sm text-gob-text leading-tight ${labelClassName ?? ""}`.trim()}>
        {children}
      </span>
    </label>
  );
}
