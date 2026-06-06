// SHIM — re-exports from src/modules/cases/domain/lifecycles/types.
// Kept for backward compatibility; all importers of @/lib/case-lifecycles
// continue to work unchanged. Delete when all importers are repointed.
export type {
  CaseStatus,
  OpenTrigger,
  CaseLifecycle,
} from "@/src/modules/cases/domain/lifecycles/types";
