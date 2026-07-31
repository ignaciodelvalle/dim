import type { ReactNode } from "react";
import type { LnVstampVariant } from "./StatusFlag";
import { LnVstamp } from "./StatusFlag";

/**
 * Libreta Nacional Ledger — ruled official table.
 *
 * Used for: vaccination records in the Libreta tab.
 * - Mono uppercase header on stripe background
 * - 1px hairline row borders
 * - LnVstamp in status column
 */

export type LnLedgerColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
};

export type LnLedgerProps<T> = {
  columns: LnLedgerColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  className?: string;
};

export function LnLedger<T>({ columns, rows, rowKey, className = "" }: LnLedgerProps<T>) {
  return (
    <div
      className={[
        "overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-ln-line)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <table className="w-full border-collapse bg-[var(--color-ln-card)] text-[13px]">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="border-b border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] px-4 py-2.5 text-left font-ln-mono text-xs font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-[var(--color-ln-line-2)] last:border-b-0 hover:bg-[var(--color-ln-stripe)]"
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-[13px] align-top">
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Pre-built vaccine ledger row helpers -------------------------

export type LnVaccineRow = {
  id: string;
  name: string;
  dose?: string;
  appliedAt: string;
  nextDue?: string;
  status: LnVstampVariant;
  vet?: string;
  vetLicense?: string;
};

export function LnVaccineLedger({
  rows,
  className,
}: {
  rows: LnVaccineRow[];
  className?: string;
}) {
  const columns: LnLedgerColumn<LnVaccineRow>[] = [
    {
      key: "vaccine",
      header: "Vacuna / Dosis",
      render: (r) => (
        <div>
          <p className="font-semibold text-[var(--color-ln-ink)]">{r.name}</p>
          {r.dose && <p className="mt-px text-[11px] text-[var(--color-ln-mute)]">{r.dose}</p>}
        </div>
      ),
    },
    {
      key: "dates",
      header: "Fecha",
      render: (r) => (
        <div>
          <p className="font-ln-mono text-sm text-[var(--color-ln-ink-2)]">{r.appliedAt}</p>
          {r.nextDue && (
            <p className="mt-px font-ln-mono text-[11px] text-[var(--color-ln-mute)]">
              próx: {r.nextDue}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (r) => <LnVstamp variant={r.status} />,
      width: "120px",
    },
    {
      key: "vet",
      header: "Profesional",
      render: (r) => (
        <div>
          <p className="text-[11.5px] text-[var(--color-ln-ink-2)]">{r.vet}</p>
          {r.vetLicense && (
            <p className="mt-px font-ln-mono text-[10.5px] text-[var(--color-ln-mute)]">
              {r.vetLicense}
            </p>
          )}
        </div>
      ),
    },
  ];

  return <LnLedger columns={columns} rows={rows} rowKey={(r) => r.id} className={className} />;
}
