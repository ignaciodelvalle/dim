// Domain types for the welfare report module.
// Legal frame: Ley Nacional 14.346 (1954) — Malos tratos y actos de crueldad contra animales.
//
// Zero external imports — no Drizzle, no Next.js, no @/db runtime.
// @/db/schema type-only imports are allowed for Drizzle row shapes used by the
// repository layer; none are needed here.

// ---------------------------------------------------------------------------
// Kind
// ---------------------------------------------------------------------------

export const WELFARE_REPORT_KINDS = [
  "abandonment",
  "neglect",
  "physical_abuse",
  "chained",
  "no_shelter",
  "hoarding",
  "dog_fighting",
  "trafficking",
  "other",
] as const;

export type WelfareReportKind = (typeof WELFARE_REPORT_KINDS)[number];

export function welfareReportKindLabel(kind: WelfareReportKind | string): string {
  switch (kind) {
    case "abandonment":
      return "Abandono";
    case "neglect":
      return "Negligencia (sin agua/comida/refugio)";
    case "physical_abuse":
      return "Maltrato físico / golpes / lesiones";
    case "chained":
      return "Animal encadenado o sin movilidad";
    case "no_shelter":
      return "Sin refugio del clima";
    case "hoarding":
      return "Acumulación de animales";
    case "dog_fighting":
      return "Peleas de perros";
    case "trafficking":
      return "Tráfico / venta clandestina";
    case "other":
      return "Otra";
    default:
      return kind;
  }
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export const WELFARE_REPORT_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export type WelfareReportSeverity = (typeof WELFARE_REPORT_SEVERITIES)[number];

export function welfareReportSeverityLabel(severity: WelfareReportSeverity | string): string {
  switch (severity) {
    case "low":
      return "Baja — preocupante, no urgente";
    case "medium":
      return "Media — requiere intervención pronto";
    case "high":
      return "Alta — urgente";
    case "critical":
      return "Crítica — peligro inmediato";
    default:
      return severity;
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const WELFARE_REPORT_STATUSES = [
  "open",
  "triaged",
  "in_progress",
  "closed",
  "duplicate",
  "invalid",
] as const;

export type WelfareReportStatus = (typeof WELFARE_REPORT_STATUSES)[number];

export function welfareReportStatusLabel(status: WelfareReportStatus | string): string {
  switch (status) {
    case "open":
      return "Abierta";
    case "triaged":
      return "Revisada";
    case "in_progress":
      return "En curso";
    case "closed":
      return "Cerrada";
    case "duplicate":
      return "Duplicada";
    case "invalid":
      return "Sin sustento";
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Assignment display
// ---------------------------------------------------------------------------

/**
 * es-AR label for a denuncia's "Asignado a" chip.
 *
 * G0b (govt/public honesty): a denuncia DERIVED to an org but not assigned to a
 * named operator must NOT read as "Sin asignar" — that made a derived case look
 * unowned (the DEN-9KSC-MRMZ ambiguity). When there is no personal assignee but
 * the case has been derived, the holding ORG is the owner of record → show
 * "Derivada a {org}". Precedence: a named operator assignment always wins (an
 * operator can pick up a derived case); only when there is no assignee does the
 * derivation surface. No derivation and no assignee → the honest "Sin asignar".
 */
export function welfareAssignmentLabel(
  assignedToName: string | null | undefined,
  derivedOrgName: string | null | undefined,
): string {
  if (assignedToName) return assignedToName;
  if (derivedOrgName) return `Derivada a ${derivedOrgName}`;
  return "Sin asignar";
}

// ---------------------------------------------------------------------------
// Subject kind
// ---------------------------------------------------------------------------

export const WELFARE_REPORT_SUBJECT_KINDS = [
  "registered_pet",
  "unowned_animal",
  "location",
  "general",
] as const;

export type WelfareReportSubjectKind = (typeof WELFARE_REPORT_SUBJECT_KINDS)[number];

export function welfareReportSubjectKindLabel(kind: WelfareReportSubjectKind | string): string {
  switch (kind) {
    case "registered_pet":
      return "Mascota miMAR registrada";
    case "unowned_animal":
      return "Animal sin dueño identificado";
    case "location":
      return "Lugar / situación";
    case "general":
      return "Otro";
    default:
      return kind;
  }
}

// ---------------------------------------------------------------------------
// Flag reasons (auto-moderation heuristics)
// ---------------------------------------------------------------------------
// Reason codes are stable strings used to aggregate admin metrics and matched
// against in tests. Adding a new rule = appending a new code; never repurpose.

export const FLAG_REASONS = [
  "trivial_description",
  "critical_without_evidence",
  "duplicate_within_24h",
  "bot_suspected_dwell_time",
  "bot_suspected_honeypot",
] as const;

export type FlagReason = (typeof FLAG_REASONS)[number];
