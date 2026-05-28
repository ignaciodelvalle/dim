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
// El prop `invalid` setea aria-invalid="true" — útil cuando un Fieldset
// padre tiene error y querés que cada control herede el estado visual.

import { type InputHTMLAttributes, type ReactNode, useId } from "react";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  invalid?: boolean;
  children: ReactNode;
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
  return (
    <label htmlFor={id} className="flex items-start gap-2 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        aria-invalid={invalid || undefined}
        className={`mt-0.5 h-4 w-4 accent-gob-primary ${className ?? ""}`.trim()}
        {...rest}
      />
      <span className={`text-sm text-gob-text leading-tight ${labelClassName ?? ""}`.trim()}>
        {children}
      </span>
    </label>
  );
}
