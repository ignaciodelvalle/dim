"use server";

// subject-rights.ts — thin shim (strangler migration 57/61).
//
// Business logic moved to:
//   src/modules/auth/application/subject-rights/
//
// This file re-exports all originally-exported symbols (2 actions + 2 types)
// with identical signatures so all callers keep working unchanged.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

export type { ExportSubjectDataResult, EraseSubjectDataResult } from "@/src/modules/auth/application/subject-rights/types";
export { exportMySubjectDataAction } from "@/src/modules/auth/application/subject-rights/export-subject-data";
export { eraseMySubjectDataAction } from "@/src/modules/auth/application/subject-rights/erase-subject-data";
