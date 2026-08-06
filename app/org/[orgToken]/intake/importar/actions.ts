"use server";

// Bulk-intake CSV actions (org-pilot-pack Req 1, design D1-D5).
//
// Two-step contract:
//   1. validateIntakeCsvAction — decode + parse + map + validate EVERY row
//      through the real write-time rules (parseIntakeForm) plus the chip/
//      tattoo pre-checks, WITHOUT writing anything. Returns a per-row preview
//      and the file's SHA-256 (the idempotency anchor).
//   2. importIntakeRowsAction — writes confirmed rows ONE AT A TIME through
//      the existing per-animal use-case (createIntake). There is NO parallel
//      bulk-write path: each row is its own transaction on the event spine,
//      no batch rollback (events append-only).
//
// Idempotency (spec 1.7, HARD): every row's clientIdempotencyKey is
// deriveBulkIdempotencyKey(fileHash, rowIndex) — deterministic, so an
// accidental resubmission of an already-committed chunk hits createIntake's
// advisory-lock + pet_registered key check and reports the ORIGINAL pet as a
// no-op instead of creating a duplicate.

import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";

import {
  INTAKE_CSV_MAX_BYTES,
  INTAKE_CSV_MAX_ROWS,
  decodeIntakeCsv,
  findExactDuplicateRows,
  mapIntakeCsvRecord,
  sniffIntakeCsvDelimiter,
} from "@/lib/domain/intake-csv";
import { validateMicrochipId } from "@/lib/domain/microchip-validation";
import { deriveBulkIdempotencyKey } from "@/lib/events/event-idempotency";
import { lookupByChip } from "@/lib/infra/chip-lookup";
import { lookupByTattoo } from "@/lib/infra/tattoo-lookup";
import { pluralizeEs } from "@/lib/utils/format";
import { requireCapabilityForOrgToken } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { createIntake, parseIntakeForm } from "@/src/modules/pets/application/intake/create-intake";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntakeCsvRowPreview = {
  /** 0-based data-row index within the uploaded file. */
  index: number;
  /** Original es-AR values as uploaded — preserved for the failed-rows CSV. */
  record: Record<string, string>;
  /** Mapped intake FormData fields (meaningful when valid). */
  fields: Record<string, string>;
  valid: boolean;
  /** es-AR errors naming column and reason (spec 1.3). */
  errors: string[];
  /** Exact full-row duplicate within the file — warning only (spec 1.10). */
  duplicate: boolean;
};

export type ValidateIntakeCsvResult =
  | { ok: true; fileHash: string; rows: IntakeCsvRowPreview[] }
  | { error: string };

export type ImportIntakeRowResult = {
  index: number;
  outcome: "imported" | "failed" | "skipped";
  petToken?: string;
  petName?: string;
  reason?: string;
};

export type ImportIntakeRowsResult =
  | { ok: true; results: ImportIntakeRowResult[] }
  | { error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNextRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

function buildRowFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string" && value !== "") fd.set(key, value);
  }
  return fd;
}

/**
 * Chip/tattoo pre-checks (design D5). Chip collisions with lost/active/
 * deceased pets and possible tattoo matches all require the INDIVIDUAL form —
 * a bulk import must never auto-confirm an identity match, and the
 * photo-verification rule for tattoos is non-negotiable.
 */
async function identifierPrecheckErrors(fields: Record<string, string>): Promise<string[]> {
  const errors: string[] = [];

  const chip = fields.microchipId ?? "";
  if (chip) {
    const chipValidation = validateMicrochipId(chip);
    if (!chipValidation.ok) {
      errors.push("microchip: formato inválido (15 dígitos ISO 11784/11785)");
    } else {
      const match = await lookupByChip(chipValidation.normalized);
      if (match) {
        if (match.pet.status === "lost") {
          errors.push(
            "microchip: coincide con una mascota perdida en miMAR — usá el formulario individual para confirmar la coincidencia",
          );
        } else if (match.pet.status === "active") {
          errors.push(
            "microchip: ya registrado para una mascota activa con familia — usá el formulario individual",
          );
        } else {
          errors.push(
            "microchip: asociado a una mascota registrada como fallecida — requiere revisión, usá el formulario individual",
          );
        }
      }
    }
  }

  const tattoo = fields.tattooCode ?? "";
  if (tattoo) {
    const tattooMatch = await lookupByTattoo(tattoo);
    if (tattooMatch && tattooMatch.pet.status !== "deceased") {
      errors.push(
        "tatuaje: posible coincidencia con una mascota registrada — requiere verificación por foto, usá el formulario individual",
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// validateIntakeCsvAction
// ---------------------------------------------------------------------------

export async function validateIntakeCsvAction(
  orgToken: string,
  formData: FormData,
): Promise<ValidateIntakeCsvResult> {
  const auth = await requireCapabilityForOrgToken("intake.create", orgToken);
  if (auth.error !== null) return { error: auth.error };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Subí un archivo CSV." };
  }
  if (file.size > INTAKE_CSV_MAX_BYTES) {
    return { error: "El archivo supera el límite de 512 KB. Dividilo en partes más chicas." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(bytes).digest("hex");

  const { text } = decodeIntakeCsv(bytes);
  const delimiter = sniffIntakeCsvDelimiter(text);

  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: true,
      delimiter,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (err) {
    return {
      error: `No pudimos leer el CSV: ${err instanceof Error ? err.message : "formato inválido"}. Verificá que use la plantilla.`,
    };
  }

  if (records.length === 0) {
    return {
      error: "El archivo no tiene filas de datos. Completá la plantilla y volvé a subirla.",
    };
  }
  if (records.length > INTAKE_CSV_MAX_ROWS) {
    return {
      error: `El archivo tiene ${records.length} ${pluralizeEs(records.length, "fila")} — el máximo por importación es ${INTAKE_CSV_MAX_ROWS}.`,
    };
  }

  const duplicates = findExactDuplicateRows(records);

  const rows: IntakeCsvRowPreview[] = [];
  for (const [index, record] of records.entries()) {
    const { fields, errors } = mapIntakeCsvRecord(record);

    if (errors.length === 0) {
      // The EXACT write-time rules — preview and write can never diverge (D1).
      const { error: parseError } = parseIntakeForm(buildRowFormData(fields));
      if (parseError) errors.push(parseError);
    }

    if (errors.length === 0) {
      errors.push(...(await identifierPrecheckErrors(fields)));
    }

    rows.push({
      index,
      record,
      fields,
      valid: errors.length === 0,
      errors,
      duplicate: duplicates.has(index),
    });
  }

  return { ok: true, fileHash, rows };
}

// ---------------------------------------------------------------------------
// importIntakeRowsAction
// ---------------------------------------------------------------------------

/** Wizard submits confirmed rows in small sequential chunks (design D3). */
const MAX_CHUNK_ROWS = 20;

// Named type ON PURPOSE (not an inline literal in the signature): the authz
// fence's body extractor counts braces from the export line, and an inline
// `{ ... }` param type closes its depth counter before the body's guard call
// is ever seen — the action reads as unguarded (check-authz-guards.ts).
type ImportIntakeRowsInput = {
  fileHash: string;
  rows: { index: number; fields: Record<string, string> }[];
};

export async function importIntakeRowsAction(
  orgToken: string,
  input: ImportIntakeRowsInput,
): Promise<ImportIntakeRowsResult> {
  // Authenticate ONCE per chunk (design D2) — the use-case receives the
  // resolved actor and runs the same write path as the individual form.
  const auth = await requireCapabilityForOrgToken("intake.create", orgToken);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  if (!/^[0-9a-f]{64}$/.test(input.fileHash)) {
    return { error: "Identificador de archivo inválido. Volvé a validar el CSV." };
  }
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    return { error: "No hay filas para importar." };
  }
  if (input.rows.length > MAX_CHUNK_ROWS) {
    return { error: `Máximo ${MAX_CHUNK_ROWS} filas por tanda.` };
  }

  const results: ImportIntakeRowResult[] = [];

  for (const row of input.rows) {
    const fd = buildRowFormData(row.fields);
    // Server-controlled: never trust these from the client payload.
    fd.set("noRedirect", "1");
    fd.set("clientIdempotencyKey", deriveBulkIdempotencyKey(input.fileHash, String(row.index)));
    fd.delete("tattooAckToken");

    try {
      const result = await createIntake(orgToken, user, organization, fd);

      if (result.warning === "TATTOO_MATCH_POSSIBLE") {
        results.push({
          index: row.index,
          outcome: "skipped",
          reason:
            "Posible coincidencia por tatuaje — requiere verificación por foto, usá el formulario individual.",
        });
      } else if (result.error) {
        results.push({ index: row.index, outcome: "failed", reason: result.error });
      } else if (result.ok && result.createdPetToken) {
        results.push({
          index: row.index,
          outcome: "imported",
          petToken: result.createdPetToken,
          petName: result.createdPetName,
        });
      } else {
        results.push({
          index: row.index,
          outcome: "failed",
          reason: "Resultado inesperado del registro — revisá la fila en el formulario individual.",
        });
      }
    } catch (err) {
      if (isNextRedirect(err)) {
        // Write-time backstop (D5): createIntake redirects on a lost-chip
        // match. In bulk that confirmation MUST happen per animal.
        results.push({
          index: row.index,
          outcome: "skipped",
          reason:
            "El microchip coincide con una mascota perdida — requiere el flujo individual de confirmación.",
        });
      } else {
        results.push({
          index: row.index,
          outcome: "failed",
          reason: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }
  }

  return { ok: true, results };
}
