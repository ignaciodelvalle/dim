"use client";

// LibroFilterFields — combined Provincia/Localidad + Desde/Hasta children-slot
// control for admin/libro's OpFilterBar, committing all four params together
// behind ONE "Aplicar".
//
// ROOT-CAUSE FIX (R2, opfilterbar-sweep-2026-07-21): libro was the ONLY
// screen composing BOTH shared <JurisdictionFilterFields> AND
// <DateRangeFilterFields> side by side. Each of those shared components owns
// its OWN <form> + "Aplicar" submit button (by design — a per-keystroke
// axis-style commit would fire mid-typing into the masked date input / the
// locality typeahead, so both fields need to commit together on an explicit
// click) — but putting BOTH components in the same bar meant TWO independent
// forms, so libro rendered TWO "Aplicar" buttons. Every other OpFilterBar
// screen has zero (axes commit on-change) or exactly one batched group.
//
// FIX: libro gets its own combined control, built from the underlying
// fields-only primitives (<JurisdictionFilter>, <DateInputAr> — neither
// renders its own <form> or button) inside a SINGLE <form> with a SINGLE
// "Aplicar" that commits all four params (provincia/localidad/desde/hasta)
// in one full-document nav via the same serverNavCommit primitive every
// other OpFilterBar control uses. <JurisdictionFilterFields> and
// <DateRangeFilterFields> are UNCHANGED — /admin/auditoria and
// /admin/alertas keep using <DateRangeFilterFields> alone (one field-group,
// one button already) and are unaffected.
import { useSearchParams } from "next/navigation";
import { type FormEvent, useId } from "react";

import { JurisdictionFilter } from "@/components/JurisdictionFilter";
import { DateInputAr } from "@/components/ui/DateInputAr";
import { OpButton } from "@/components/ui/dashboard/OpButton";
import { serverNavCommit } from "@/lib/ui/filter-commit";

const captionClasses = "text-sm font-medium text-ln-op-ink-2";
const labelClassName = "flex w-full flex-col gap-1 sm:w-auto";

const selectClasses =
  "min-h-11 w-full rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 text-sm " +
  "text-ln-op-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-azul sm:w-[10rem]";

const dateInputClasses =
  "h-11 w-full rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 text-sm " +
  "text-ln-op-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-azul sm:w-[9.5rem]";

export type LibroFilterFieldsProps = {
  /** Current province NAME searchParam value ("provincia"), or undefined when unset. */
  provinceValue?: string;
  /** Current locality NAME searchParam value ("localidad"), or undefined when unset. */
  localityValue?: string;
  /** Current ISO (yyyy-mm-dd) "desde" value, or undefined when unset. */
  fromValue?: string;
  /** Current ISO (yyyy-mm-dd) "hasta" value, or undefined when unset. */
  toValue?: string;
  /** Extra searchParam keys to drop on commit (e.g. the keyset `cursor`). */
  resetParamsOnChange?: readonly string[];
};

export function LibroFilterFields({
  provinceValue,
  localityValue,
  fromValue,
  toValue,
  resetParamsOnChange = [],
}: LibroFilterFieldsProps) {
  const searchParams = useSearchParams();
  const uid = useId();
  const fromId = `${uid}-from`;
  const toId = `${uid}-to`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const provincia = (data.get("provincia") as string | null) || null;
    const localidad = (data.get("localidad") as string | null) || null;
    const desde = (data.get("desde") as string | null) || null;
    const hasta = (data.get("hasta") as string | null) || null;
    serverNavCommit(searchParams.toString())(
      { provincia, localidad, desde, hasta },
      resetParamsOnChange,
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3"
      aria-label="Filtro de jurisdicción y fecha"
    >
      <JurisdictionFilter
        provinceParam="provincia"
        localityParam="localidad"
        defaultProvince={provinceValue ?? ""}
        defaultLocality={localityValue ?? ""}
        labelClassName={labelClassName}
        selectClassName={selectClasses}
      />
      <label htmlFor={fromId} className={labelClassName}>
        <span className={captionClasses}>Desde</span>
        <DateInputAr
          id={fromId}
          name="desde"
          defaultValue={fromValue}
          className={dateInputClasses}
        />
      </label>
      <label htmlFor={toId} className={labelClassName}>
        <span className={captionClasses}>Hasta</span>
        <DateInputAr id={toId} name="hasta" defaultValue={toValue} className={dateInputClasses} />
      </label>
      <OpButton type="submit" variant="primary" size="sm" className="h-11 px-4">
        Aplicar
      </OpButton>
    </form>
  );
}
