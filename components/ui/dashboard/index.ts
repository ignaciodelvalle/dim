export { OpButton } from "./OpButton";
export type { OpButtonVariant, OpButtonSize } from "./OpButton";
export { OpRail } from "./OpRail";
export { OpRailNav } from "./OpRailNav";
export type { NavSection } from "./OpRailNav";
export { OpTopbar } from "./OpTopbar";
export { OpCrumbs } from "./OpCrumbs";
export type { CrumbItem } from "./OpCrumbs";
export { OrgBreadcrumbs } from "./OrgBreadcrumbs";
export { OperatorBreadcrumbs } from "./OperatorBreadcrumbs";
export { OpScopeChip } from "./OpScopeChip";
export { OpMobileDrawer } from "./OpMobileDrawer";
export { OpKpi, OpKpiSm } from "./OpKpi";
export { KpiStrip } from "./KpiStrip";
export type { KpiStripProps } from "./KpiStrip";
export { OpPill } from "./OpPill";
export { OpStatusPill } from "./OpStatusPill";
export type { StatusTone } from "./OpStatusPill";
export { OpCodeBadge } from "./OpCodeBadge";
export { OpCard, OpCardHead, OpCardBody } from "./OpCard";
export { OpFilterBar } from "./OpFilterBar";
export type {
  OpFilterBarProps,
  OpFilterBarPeriod,
  OpFilterBarJurisdiction,
  OpFilterAxis,
  OpFilterAxisOption,
} from "./OpFilterBar";
export { CopyViewButton } from "./CopyViewButton";
export { OpBreach } from "./OpBreach";
export { OpCallout } from "./OpCallout";
export { OpOfflineBanner } from "./OpOfflineBanner";
export { OpMaintenanceScreen } from "./OpMaintenanceScreen";
export { OpStateBadge } from "./OpStateBadge";
export { OpOmnibox } from "./OpOmnibox";
export { OpBulkBar } from "./OpBulkBar";
export type { OpBulkAction } from "./OpBulkBar";
export { OpBulkResultPanel } from "./OpBulkResultPanel";
export type { OpBulkResultPanelProps } from "./OpBulkResultPanel";
export { OpDashboardSkeleton } from "./OpDashboardSkeleton";
export type { OpDashboardSkeletonProps } from "./OpDashboardSkeleton";
export { CaseStatusBadge, CASE_STATUS_CONFIG, caseStatusDisplay } from "./CaseStatusBadge";
export { CaseHeader } from "./CaseHeader";
export type { CaseHeaderProps, CaseHeaderStatus } from "./CaseHeader";
export { CaseDetailShell } from "./CaseDetailShell";
export type { CaseDetailShellProps, CaseParty, CaseSubjectDescriptor } from "./CaseDetailShell";
export { CaseQueue } from "./CaseQueue";
export type {
  CaseQueueRow,
  CaseQueueFilters,
  CaseQueueBulkConfig,
  CaseQueueProps,
} from "./CaseQueue";
export { CasoEstadoFilter } from "./CasoEstadoFilter";
// parseCasoEstado/CasoEstado live in ./caso-estado (no "use client") — a
// Server Component calls parseCasoEstado directly, and every export of a
// "use client" module is a client reference (ROOT-CAUSE FIX, R1).
export { parseCasoEstado } from "./caso-estado";
export type { CasoEstado } from "./caso-estado";
export { DateRangeFilterFields } from "./DateRangeFilterFields";
export type { DateRangeFilterFieldsProps } from "./DateRangeFilterFields";
export { JurisdictionFilterFields } from "./JurisdictionFilterFields";
export type { JurisdictionFilterFieldsProps } from "./JurisdictionFilterFields";
export { SearchFilterField } from "./SearchFilterField";
export type { SearchFilterFieldProps } from "./SearchFilterField";
export { AuditMineToggle } from "./AuditMineToggle";
export type { AuditMineToggleProps } from "./AuditMineToggle";
export {
  OpFormAlert,
  OpFieldLabel,
  OpFieldHint,
  OpInput,
  OpSelect,
  OpTextarea,
  OpSubmitButton,
  OpCheckbox,
} from "./OpField";
export type { OpCheckboxProps } from "./OpField";
// NOTE: DashboardFreshnessFooter is a SERVER component (queries the DB via
// lib/metrics/freshness → db → postgres). It must NOT be re-exported here —
// this barrel is imported by client components (e.g. PanoramaConsole →
// PanoramaKpiStrip), and re-exporting a server-only module pulls `postgres`
// (Node `net`/`tls`) into the client bundle ("Can't resolve 'net'"). Import it
// directly from "@/components/ui/dashboard/DashboardFreshnessFooter" instead.
