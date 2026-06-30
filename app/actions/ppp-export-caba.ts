"use server";

// ppp-export-caba.ts — thin shim (strangler migration 36/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/pets/application/ppp-export/
//
// This file re-exports all originally-exported symbols (1 action + 1 type)
// with identical signatures so all callers keep working unchanged.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import type { GeneratePppExportResult } from "@/src/modules/pets/application/ppp-export/types";
import { generatePppExport } from "@/src/modules/pets/application/ppp-export/generate-ppp-export";

export type { GeneratePppExportResult };

export async function generatePppExportAction(
  petPublicToken: string,
): Promise<GeneratePppExportResult> {
  return generatePppExport(petPublicToken);
}
