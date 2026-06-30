"use server";

// scans.ts — thin shim (strangler migration 58/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/pets/application/scans/
//
// This file re-exports all originally-exported symbols with identical
// signatures so all callers keep working unchanged.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function.

import { logScan as _logScan } from "@/src/modules/pets/application/scans/log-scan";

export async function logScanAction(publicToken: string): Promise<void> {
  return _logScan(publicToken);
}
