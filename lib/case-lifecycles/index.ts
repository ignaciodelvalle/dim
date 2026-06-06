// SHIM — re-exports from src/modules/cases/domain/lifecycles.
// Kept for backward compatibility; all importers of @/lib/case-lifecycles
// continue to work unchanged. Delete when all importers are repointed.
export {
  getLifecycle,
  allLifecycles,
  type CaseLifecycle,
  type CaseStatus,
  type OpenTrigger,
} from "@/src/modules/cases/domain/lifecycles/index";
