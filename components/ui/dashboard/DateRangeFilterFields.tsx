"use client";

// DateRangeFilterFields — shared Desde/Hasta children-slot control for
// OpFilterBar screens whose date range has NO default bound (F-migration
// 2026-07-21 cluster 2: /admin/alertas, /admin/auditoria). Unlike
// OpFilterBar's own `period` prop — which always resolves to a preset
// default (e.g. trailing12m) — these screens treat "no from/no to" as
// genuinely unbounded ("todas las fechas"), so routing them through `period`
// would silently introduce a default preset that never existed. Kept as a
// small self-contained <form> in the `children` slot instead: both
// DateInputAr fields commit TOGETHER on one "Aplicar" click (a per-keystroke
// axis-style commit would fire on every partial digit typed into the masked
// dd/mm/aaaa input), via the SAME serverNavCommit primitive every other
// OpFilterBar control uses. Nesting a plain <form> here is safe — OpFilterBar
// itself never renders a surrounding <form>.
import { useSearchParams } from "next/navigation";
import { type FormEvent, useId } from "react";

import { DateInputAr } from "@/components/ui/DateInputAr";
import { OpButton } from "@/components/ui/dashboard/OpButton";
import { serverNavCommit } from "@/lib/ui/filter-commit";

const captionClasses = "text-sm font-medium text-ln-op-ink-2";

const dateInputClasses =
  "h-11 w-full rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 text-sm " +
  "text-ln-op-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-azul sm:w-[9.5rem]";

export type DateRangeFilterFieldsProps = {
  /** searchParam key for the range start. Default "from". */
  fromKey?: string;
  /** searchParam key for the range end. Default "to". */
  toKey?: string;
  /** Current ISO (yyyy-mm-dd) value of each bound, or null/undefined when unset. */
  fromValue?: string | null;
  toValue?: string | null;
  /** Extra searchParam keys to drop on commit (e.g. a keyset `cursor`). */
  resetParamsOnChange?: readonly string[];
};

export function DateRangeFilterFields({
  fromKey = "from",
  toKey = "to",
  fromValue,
  toValue,
  resetParamsOnChange = [],
}: DateRangeFilterFieldsProps) {
  const searchParams = useSearchParams();
  const uid = useId();
  const fromId = `${uid}-from`;
  const toId = `${uid}-to`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = (data.get(fromKey) as string | null) || null;
    const to = (data.get(toKey) as string | null) || null;
    serverNavCommit(searchParams.toString())({ [fromKey]: from, [toKey]: to }, resetParamsOnChange);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <label htmlFor={fromId} className="flex w-full flex-col gap-1 sm:w-auto">
        <span className={captionClasses}>Desde</span>
        <DateInputAr
          id={fromId}
          name={fromKey}
          defaultValue={fromValue}
          className={dateInputClasses}
        />
      </label>
      <label htmlFor={toId} className="flex w-full flex-col gap-1 sm:w-auto">
        <span className={captionClasses}>Hasta</span>
        <DateInputAr id={toId} name={toKey} defaultValue={toValue} className={dateInputClasses} />
      </label>
      <OpButton type="submit" variant="primary" size="sm" className="h-11 px-4">
        Aplicar
      </OpButton>
    </form>
  );
}
