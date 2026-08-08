"use client";

// ImportWizard — bulk-intake CSV wizard (org-pilot-pack Req 1, design D3).
//
// upload → preview (server-validated, nothing written) → confirm → sequential
// chunks of 5 through importIntakeRowsAction → per-row report with a
// failed-rows CSV re-download (template layout + error column, original data
// preserved — fix and re-upload without retyping the successful rows).
//
// Only VALID rows are ever submitted (spec 1.4); at zero valid rows the
// confirm CTA is disabled (spec 1.9). Exact full-row duplicates get a visual
// warning but import normally — littermates are legitimate (spec 1.10).

import { useRef, useState } from "react";

import { OpButton, OpFileInput } from "@/components/ui/dashboard";
import { buildFailedRowsCsv } from "@/lib/domain/intake-csv";

import {
  type ImportIntakeRowResult,
  type IntakeCsvRowPreview,
  importIntakeRowsAction,
  validateIntakeCsvAction,
} from "./actions";

const CHUNK_SIZE = 5;

type WizardStep = "upload" | "preview" | "importing" | "report";

function chunkRows<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

export function ImportWizard({ orgToken }: { orgToken: string }) {
  const [step, setStep] = useState<WizardStep>("upload");
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [preview, setPreview] = useState<{
    fileHash: string;
    rows: IntakeCsvRowPreview[];
  } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ImportIntakeRowResult[]>([]);
  // Hiding the native control also hides the filename it used to print, so the
  // wizard now owns that feedback (OpFileInput `status`).
  const [selectedFileName, setSelectedFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = preview?.rows.filter((r) => r.valid) ?? [];
  const invalidRows = preview?.rows.filter((r) => !r.valid) ?? [];

  async function handleFileSelected(file: File) {
    setError(null);
    setValidating(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await validateIntakeCsvAction(orgToken, fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setPreview({ fileHash: res.fileHash, rows: res.rows });
      setResults([]);
      setStep("preview");
    } finally {
      setValidating(false);
    }
  }

  async function confirmImport() {
    if (!preview || validRows.length === 0) return;
    const rowsToImport = validRows.map((r) => ({ index: r.index, fields: r.fields }));
    const chunks = chunkRows(rowsToImport, CHUNK_SIZE);

    setStep("importing");
    setProgress({ done: 0, total: chunks.length });

    const accumulated: ImportIntakeRowResult[] = [];
    for (const chunk of chunks) {
      const res = await importIntakeRowsAction(orgToken, {
        fileHash: preview.fileHash,
        rows: chunk,
      });
      if ("error" in res) {
        // A whole-chunk failure (auth loss, transient) still lands in the
        // report per row — a row that passed preview MAY fail at confirm and
        // MUST appear, never be silently dropped (spec 1.5).
        for (const row of chunk) {
          accumulated.push({ index: row.index, outcome: "failed", reason: res.error });
        }
      } else {
        accumulated.push(...res.results);
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setResults(accumulated);
    setStep("report");
  }

  function downloadFailedRowsCsv() {
    if (!preview) return;
    const failedFromPreview = invalidRows.map((r) => ({ record: r.record, errors: r.errors }));
    const failedFromImport = results
      .filter((r) => r.outcome !== "imported")
      .map((r) => {
        const row = preview.rows.find((p) => p.index === r.index);
        return { record: row?.record ?? {}, errors: [r.reason ?? "Falló al confirmar"] };
      });
    const csv = buildFailedRowsCsv([...failedFromPreview, ...failedFromImport]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "filas-con-error.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const failedCount = invalidRows.length + results.filter((r) => r.outcome !== "imported").length;

  return (
    <div className="space-y-5">
      {/* Template download — always visible so the org can grab it any time. */}
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/org/${orgToken}/intake/importar/template`}
          className="inline-flex items-center rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-md font-medium text-ln-op-ink hover:bg-ln-op-stripe transition-colors no-underline"
          download
        >
          Descargar plantilla
        </a>
        <span className="text-sm text-ln-op-mute">
          Completá la plantilla (una fila por animal, máximo 200) y subila acá.
        </span>
      </div>

      {/* The other direction (org-first readiness #4). The export uses this same
          layout, so what comes out can go back in — and an org that wants to
          correct twenty rows in Excel starts from its real data instead of an
          empty template. */}
      <p className="text-sm text-ln-op-mute">
        ¿Querés bajar lo que ya está cargado?{" "}
        <a href={`/org/${orgToken}/mascotas/exportar`} className="text-ln-op-azul hover:underline">
          Exportar CSV
        </a>
      </p>

      {step === "upload" && (
        <div className="space-y-3">
          {/* NOT a wrapping <label>: OpFileInput renders its own htmlFor label,
              and nesting labels is invalid HTML — the outer one would swallow
              the click and the picker would never open. Plain span + the
              component's own `id` association instead. */}
          <div className="space-y-1">
            <span id="csv-file-label" className="block text-md text-ln-op-ink">
              Archivo CSV
            </span>
            <OpFileInput
              ref={fileInputRef}
              accept=".csv,text/csv"
              disabled={validating}
              aria-labelledby="csv-file-label"
              status={selectedFileName}
              onChange={(e) => {
                const file = e.target.files?.[0];
                setSelectedFileName(file?.name ?? "");
                if (file) void handleFileSelected(file);
              }}
            />
          </div>
          {validating && <p className="text-sm text-ln-op-mute">Validando el archivo…</p>}
        </div>
      )}

      {error && (
        <p className="rounded-[var(--radius-md)] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-md text-ln-op-danger">
          {error}
        </p>
      )}

      {step === "preview" && preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-md">
            <span className="rounded-[var(--radius-sm)] border border-ln-op-ok-bd bg-ln-op-ok-bg px-2 py-1 font-medium text-ln-op-ok">
              Válidas ({validRows.length})
            </span>
            <span className="rounded-[var(--radius-sm)] border border-ln-op-danger-bd bg-ln-op-danger-bg px-2 py-1 font-medium text-ln-op-danger">
              Con errores ({invalidRows.length})
            </span>
          </div>

          <ul className="divide-y divide-ln-op-line rounded-[var(--radius-md)] border border-ln-op-line">
            {preview.rows.map((row) => (
              <li key={row.index} className="px-3 py-2 text-md space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-ln-op-mute">Fila {row.index + 1}</span>
                  <span className="font-medium text-ln-op-ink">
                    {row.record["nombre*"] ?? row.record.nombre ?? "(sin nombre)"}
                  </span>
                  {row.valid ? (
                    <span className="text-sm text-ln-op-ok">válida</span>
                  ) : (
                    <span className="text-sm text-ln-op-danger">con errores</span>
                  )}
                  {row.duplicate && (
                    <span className="rounded-[var(--radius-sm)] border border-ln-op-warn-bd bg-ln-op-warn-bg px-1.5 py-0.5 text-sm text-ln-op-warn">
                      Fila duplicada dentro del archivo
                    </span>
                  )}
                </div>
                {row.errors.length > 0 && (
                  <ul className="list-disc pl-5 text-sm text-ln-op-danger">
                    {row.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <OpButton
              type="button"
              onClick={confirmImport}
              disabled={validRows.length === 0}
              variant="primary"
            >
              Confirmar importación
            </OpButton>
            {invalidRows.length > 0 && (
              <OpButton type="button" onClick={downloadFailedRowsCsv} variant="ghost">
                Descargar filas con error
              </OpButton>
            )}
            <OpButton
              type="button"
              variant="ghost"
              onClick={() => {
                setPreview(null);
                setStep("upload");
              }}
            >
              Elegir otro archivo
            </OpButton>
          </div>
          {validRows.length === 0 && (
            <p className="text-sm text-ln-op-mute">
              No hay filas válidas para importar. Corregí los errores y volvé a subir el archivo.
            </p>
          )}
        </div>
      )}

      {step === "importing" && (
        // <output> is the semantic live-region element (biome a11y rule) —
        // announces chunk progress without an explicit role.
        <output className="block space-y-2">
          <p className="text-md text-ln-op-ink">
            Importando… tanda {Math.min(progress.done + 1, progress.total)} de {progress.total}
          </p>
          <div className="h-2 w-full rounded-full bg-ln-op-stripe">
            <div
              className="h-2 rounded-full bg-ln-op-azul transition-all"
              style={{
                width: `${progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}%`,
              }}
            />
          </div>
        </output>
      )}

      {step === "report" && preview && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ln-op-mute">
            Resultado de la importación
          </h2>

          <ul className="divide-y divide-ln-op-line rounded-[var(--radius-md)] border border-ln-op-line">
            {results.map((result) => (
              <li
                key={result.index}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-md"
              >
                <div className="min-w-0 space-y-0.5">
                  <span className="font-mono text-sm text-ln-op-mute">Fila {result.index + 1}</span>{" "}
                  {result.outcome === "imported" && (
                    <span className="text-ln-op-ok">Importada — {result.petName}</span>
                  )}
                  {result.outcome === "failed" && (
                    <span className="text-ln-op-danger">Falló: {result.reason}</span>
                  )}
                  {result.outcome === "skipped" && (
                    <span className="text-ln-op-warn">Salteada: {result.reason}</span>
                  )}
                </div>
                {result.outcome === "imported" && result.petToken && (
                  <a
                    href={`/org/${orgToken}/mascotas/${result.petToken}`}
                    className="shrink-0 rounded-[var(--radius-md)] border border-ln-op-line px-3 py-1.5 text-sm text-ln-op-ink hover:bg-ln-op-stripe transition-colors no-underline"
                  >
                    Ver ficha
                  </a>
                )}
              </li>
            ))}
          </ul>

          {failedCount > 0 && (
            <OpButton type="button" onClick={downloadFailedRowsCsv} variant="ghost">
              Descargar filas con error
            </OpButton>
          )}
        </div>
      )}
    </div>
  );
}
