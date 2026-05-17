// Spanish-language label maps for the welfare report domain.
// Legal frame: Ley Nacional 14.346 (1954) — Malos tratos y actos de crueldad contra animales.

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
      return "Acumulación (hoarding)";
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
      return "Mascota MiMAR registrada";
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
