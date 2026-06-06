// Re-export shim. This file is the original home of welfare domain types and
// label helpers. Its content has been extracted to:
//   src/modules/welfare/domain/types.ts
//
// This shim preserves the @/lib/welfare import path for all existing client
// and server importers. Do NOT delete until all importers have been repointed
// to @/modules/welfare/domain/types (WU-4 strangler step).

export {
  FLAG_REASONS,
  WELFARE_REPORT_KINDS,
  WELFARE_REPORT_SEVERITIES,
  WELFARE_REPORT_STATUSES,
  WELFARE_REPORT_SUBJECT_KINDS,
  type FlagReason,
  type WelfareReportKind,
  type WelfareReportSeverity,
  type WelfareReportStatus,
  type WelfareReportSubjectKind,
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
  welfareReportSubjectKindLabel,
} from "@/src/modules/welfare/domain/types";
