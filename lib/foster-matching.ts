// Re-export shim — logic moved to src/modules/foster/domain/matching-rules.ts.
// This shim keeps existing callers (app/actions/foster-proposals.ts,
// __tests__/foster-matching.test.ts) working until WU-4 repoints them.
// Delete this file after all consumers are repointed and WU-5 cleanup runs.

export type {
  MatchPet,
  MatchScoreResult,
  MatchWarning,
} from "@/src/modules/foster/domain/matching-rules";
export { ageMonthsFromDob, computeMatch } from "@/src/modules/foster/domain/matching-rules";
