// SHIM — re-exports from src/modules/cases/domain/case-kinds.
// Kept for backward compatibility; all importers of @/lib/case-kinds
// continue to work unchanged. Delete when all importers are repointed.
export {
  CASE_KINDS,
  type CaseKind,
  V1_CASE_KINDS,
  isCaseKind,
  caseKindLabel,
} from "@/src/modules/cases/domain/case-kinds";
