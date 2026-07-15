// Serialization for the public open-data downloads (Epic B, item 2).
//
// Two formats, one metadata contract. Both carry the dataset's license,
// generated-at, methodology + dictionary URLs and suppression rule so a
// downloaded file is self-describing offline (not only via HTTP headers).
//
// Pure (no DB, no Next.js) so the framing is unit-testable directly.

import { rowsToCsv } from "@/lib/analytics/govt-exports";
import type { BuiltDataset } from "@/lib/open-data/datasets";

export type DatasetFormat = "csv" | "json";

/** Parse the ?format= query value. Anything but "csv" falls back to JSON. */
export function parseFormat(value: string | null | undefined): DatasetFormat {
  return value === "csv" ? "csv" : "json";
}

/**
 * CSV document: UTF-8 BOM (Excel), then a metadata preamble as `#` comment
 * lines, a blank line, then the RFC 4180 table (rowsToCsv). Suppressed cells are
 * already the literal marker string in `rows`, so they export verbatim.
 */
export function datasetToCsv(built: BuiltDataset): string {
  const { meta, rows } = built;
  const preamble = [
    `# ${meta.title}`,
    `# dataset: ${meta.id}`,
    `# descripcion: ${meta.summary}`,
    `# unidad: ${meta.unit}`,
    `# actualizacion: ${meta.cadence}`,
    `# generado: ${meta.generatedAt}`,
    `# licencia: ${meta.license.name}`,
    `# licencia_url: ${meta.license.url}`,
    `# atribucion: ${meta.license.attribution}`,
    `# metodologia: ${meta.methodologyUrl}`,
    `# diccionario: ${meta.dictionaryUrl}`,
    `# supresion: k=${meta.suppression.k}; ${meta.suppression.rule}`,
    `# filas: ${meta.rowCount} (suprimidas: ${meta.suppressedCount})`,
  ].join("\r\n");
  const table = rowsToCsv(rows);
  return `﻿${preamble}\r\n\r\n${table}\r\n`;
}

/** JSON document: `{ meta, data }`. The metadata block is identical to CSV's
 *  preamble content, structured. */
export function datasetToJson(built: BuiltDataset): string {
  return JSON.stringify({ meta: built.meta, data: built.rows }, null, 2);
}
