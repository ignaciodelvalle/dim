// Radio: native <input type="radio"> con look Poncho. Mismo patrón que
// <Checkbox> — el label viaja como children y el componente lo envuelve
// en un <label> nativo. Diseñado para vivir dentro de <Fieldset>:
//
//   <Fieldset legend="Procedimiento" required>
//     <Radio name="procedure" value="castration" required>Castración</Radio>
//     <Radio name="procedure" value="spay">Ovariectomía</Radio>
//   </Fieldset>
//
// Recordá: en HTML los radios se agrupan por `name`. Todos los <Radio> de
// un grupo deben compartir el mismo name. Marcá `required` en el primero
// y el browser fuerza que al menos uno esté seleccionado.
//
// Sin `children` el control es label-less: renderiza sólo el <input> (pasá
// `aria-label` para nombrarlo).

import { type InputHTMLAttributes, type ReactNode, useId } from "react";

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  invalid?: boolean;
  /** Label content. Omití para un control label-less (pasá `aria-label` en su lugar). */
  children?: ReactNode;
  /** Extra classes for the label text span — e.g. to tint copy with a warning/danger color. */
  labelClassName?: string;
};

export function Radio({
  invalid,
  children,
  className,
  labelClassName,
  id: idProp,
  ...rest
}: RadioProps) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const input = (
    <input
      id={id}
      type="radio"
      aria-invalid={invalid || undefined}
      className={`mt-0.5 h-4 w-4 shrink-0 accent-gob-primary ${className ?? ""}`.trim()}
      {...rest}
    />
  );
  // Label-less: render just the input — the caller supplies aria-label.
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
