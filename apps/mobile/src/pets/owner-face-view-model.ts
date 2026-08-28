// The owner face, turned into es-AR sentences.
//
// PURE. No React, no React Native, no fetch — the same discipline
// `credential-view-model.ts` keeps, and for the same reason: every label rule
// below is a product decision, and a product decision that can only be checked
// by rendering a screen is one that drifts.
//
// WHAT THIS FACE IS. Not the credential. `/pets/{token}/credential` is the
// anonymous public document and renders identically for the owner and for a
// stranger who scanned the QR. This is what the person RESPONSIBLE for the
// animal sees. Since the two-face rewrite the public document is a ROUTE one
// tap from this face's QR block; neither replaces the other.

import type {
  CredentialSection,
  OwnerPetAlertV1,
  OwnerPetBannersSection,
  OwnerPetCarouselSection,
  OwnerPetCasesSection,
  OwnerPetComplianceSection,
  OwnerPetDetailV1,
  OwnerPetDetailViewerRole,
  OwnerPetIdentitySection,
  OwnerPetPregnancySection,
  OwnerPetRemindersSection,
  OwnerPetStatusSection,
} from "@dim/contract/api";

/** The es-AR sentence every unavailable section shows. Decided once. */
export const SECTION_UNAVAILABLE_MESSAGE = "No se pudo leer esta sección.";

export type SectionView<T> = { state: "ok"; data: T } | { state: "unavailable"; message: string };

/**
 * A section, as the renderer sees it.
 *
 * The `unavailable` arm carries its copy rather than a bare tag so a screen
 * cannot render the failure as an empty view without noticing it threw a string
 * away. `unavailable` means the server could not read it — NOT that it is empty,
 * and the difference is the whole reason the wrapper exists.
 */
export function sectionView<T>(section: CredentialSection<T>): SectionView<T> {
  return section.status === "ok"
    ? { state: "ok", data: section.data }
    : { state: "unavailable", message: SECTION_UNAVAILABLE_MESSAGE };
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

/**
 * The alert strip's copy.
 *
 * ORDER IS NOT DECIDED HERE. The server sends the list already ranked, and a
 * client that sorts it has reimplemented a product decision whose reasons it
 * cannot see. This maps an id to a sentence and nothing else.
 */
export function alertHeadline(alert: OwnerPetAlertV1): string {
  switch (alert.id) {
    case "lost":
      return "Está reportada como perdida";
    case "rabies":
      return "Observación antirrábica abierta";
    case "transit":
      return "La estás cuidando en tránsito";
    case "caretaker":
      return "Hay un cuidador designado";
    case "rehome":
      return "Está en búsqueda de un nuevo hogar";
    case "open-cases":
      return "Tiene trámites abiertos";
    case "pregnancy":
      return "Está preñada";
    default: {
      // A tone the client does not know is a payload from a newer server. Say
      // so plainly instead of dropping the row: an alert the owner cannot see is
      // worse than one they cannot fully read.
      const unknown: never = alert.id;
      return `Aviso sin descripción (${String(unknown)})`;
    }
  }
}

/** Maps the strip's tone onto the kit's callout tones. */
export function alertTone(alert: OwnerPetAlertV1): "err" | "warn" | "neutral" {
  if (alert.tone === "urgent") return "err";
  if (alert.tone === "warning") return "warn";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

/**
 * How the viewer holds this animal, in words.
 *
 * Shown because a caretaker or a foster reading this face needs to know WHY
 * some things are missing from it — the arrangements a titular made are not
 * theirs to see, and an unexplained gap reads as a bug.
 */
export function viewerRoleLabel(role: OwnerPetDetailViewerRole): string {
  switch (role) {
    case "owner":
      return "Sos el titular";
    case "co_owner":
      return "Sos cotitular";
    case "foster":
      return "La tenés en tránsito";
    case "caretaker":
      return "Sos su cuidador";
    case "org_member":
      return "La ves como miembro de la organización";
    default: {
      const unknown: never = role;
      return String(unknown);
    }
  }
}

/**
 * The registration badge's word, gender-agreed with the animal's recorded sex —
 * the same rule the web's `registeredAdjective` (lib/utils/format.ts) applies
 * to the identical badge. Presentational agreement, not a state decision: the
 * STATE (active) comes from the payload.
 */
export function registeredBadgeWord(sex: string | null): string {
  if (sex === "male") return "Registrado";
  if (sex === "female") return "Registrada";
  return "Registrado/a";
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

/**
 * The stamp's word.
 *
 * SIN DATO is not a temporal word, and that distinction is load-bearing: when
 * the most urgent card is a missing FACT, stamping "POR VENCER" over it borrows
 * a deadline that does not exist. The server already decided which case this is
 * (`worstIsUnknown`); this only prints it.
 */
export function complianceStampLabel(compliance: OwnerPetComplianceSection): string {
  if (compliance.worstIsUnknown) return "SIN DATO";
  switch (compliance.worstTone) {
    case "ok":
      return "AL DÍA";
    case "due":
      return "POR VENCER";
    case "over":
      return "VENCIDA";
    case "reserved":
      return "TURNO RESERVADO";
    default:
      return "SIN DATO";
  }
}

/**
 * The count line, or an honest note when the jurisdiction has no obligations
 * loaded. `total === 0` is not "0 de 0 al día" — it is "we have no rules for
 * here yet", which is a different thing to tell an owner.
 */
export function complianceSummaryLabel(compliance: OwnerPetComplianceSection): string {
  if (compliance.summary.total === 0) return "Sin obligaciones cargadas para tu jurisdicción";
  return compliance.summary.label;
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

/** "Vence hoy" / "Vence en 3 días" / "Venció hace 2 días". Never a bare number. */
export function reminderDueLabel(daysUntilDue: number): string {
  if (daysUntilDue === 0) return "Vence hoy";
  if (daysUntilDue === 1) return "Vence mañana";
  if (daysUntilDue > 1) return `Vence en ${daysUntilDue} días`;
  const overdue = Math.abs(daysUntilDue);
  return overdue === 1 ? "Venció ayer" : `Venció hace ${overdue} días`;
}

/**
 * The note under a truncated list.
 *
 * A list that shows some of what exists must SAY so. The alternative — showing
 * eight of fourteen silently — is the bug the web carousel already had once,
 * where the dots disagreed with the index and nobody could tell which was lying.
 */
export function truncationNote(shown: number, total: number, noun: string): string | null {
  if (shown >= total) return null;
  return `Mostrando ${shown} de ${total} ${noun}.`;
}

/**
 * An empty reminders list is a FACT, and a different one from a failed read.
 * Owned here, next to every other copy decision, so the screen cannot drift a
 * second wording into existence.
 */
export const REMINDERS_EMPTY_LABEL = "No hay recordatorios activos.";

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

export function caretakerBannerLines(banners: OwnerPetBannersSection): string[] {
  const caretaker = banners.caretaker;
  if (!caretaker) return [];
  const lines: string[] = [];
  switch (caretaker.state) {
    case "active":
      lines.push(
        caretaker.caretakerName
          ? `${caretaker.caretakerName} la está cuidando.`
          : "Hay un cuidador activo.",
      );
      break;
    case "pending":
      lines.push("Hay una invitación de cuidado sin responder.");
      break;
    case "recently_ended":
      lines.push("El cuidado terminó hace poco.");
      break;
  }
  // KEY 2 of the two-key public-contact model. The row exists ONLY when the
  // caretaker consented at invitation accept; without consent there is nothing
  // to offer, and a switch that cannot do anything is a lie in the shape of a
  // control.
  if (caretaker.publicContactName) {
    lines.push(`${caretaker.publicContactName} figura como contacto público.`);
  }
  return lines;
}

export function rehomeBannerLine(banners: OwnerPetBannersSection): string | null {
  const rehome = banners.rehome;
  if (!rehome) return null;
  const org = rehome.orgDisplayName ?? "la organización";
  return rehome.kind === "pending"
    ? `Hay una propuesta de adopción pendiente con ${org}.`
    : `${org} está buscándole un nuevo hogar.`;
}

export function transitBannerLine(banners: OwnerPetBannersSection): string | null {
  if (!banners.transit) return null;
  // The vecino who picked up a stray gets the same sentence; what they do NOT
  // get are the org-mediated actions, which the web withholds for the same
  // reason (they would dead-end without an organization behind them).
  return "La tenés en tránsito. Las acciones de tránsito se hacen desde la web.";
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export function casesLine(cases: OwnerPetCasesSection): string {
  if (cases.openCount === 0) return "No tiene trámites abiertos.";
  const noun = cases.openCount === 1 ? "trámite abierto" : "trámites abiertos";
  // `truncated` means the read hit its cap, so the count is a FLOOR. Saying
  // "al menos" is the difference between a number and a guess wearing a number's
  // clothes.
  return cases.truncated ? `Al menos ${cases.openCount} ${noun}.` : `${cases.openCount} ${noun}.`;
}

// ---------------------------------------------------------------------------
// The whole face
// ---------------------------------------------------------------------------

export type OwnerFaceView = {
  publicToken: string;
  viewerLabel: string;
  /** The raw viewer role — the disabled-row gates key off it (a dead control
   *  has no server to refuse it, so the client mirrors the web's own gates). */
  viewerRole: OwnerPetDetailViewerRole;
  isTitular: boolean;
  identity: SectionView<OwnerPetIdentitySection>;
  status: SectionView<OwnerPetStatusSection>;
  alerts: SectionView<{ items: OwnerPetAlertV1[] }>;
  compliance: SectionView<OwnerPetComplianceSection>;
  reminders: SectionView<OwnerPetRemindersSection>;
  banners: SectionView<OwnerPetBannersSection>;
  cases: SectionView<OwnerPetCasesSection>;
  pregnancy: SectionView<OwnerPetPregnancySection>;
  carousel: SectionView<OwnerPetCarouselSection>;
};

export function buildOwnerFaceView(payload: OwnerPetDetailV1): OwnerFaceView {
  return {
    publicToken: payload.publicToken,
    viewerLabel: viewerRoleLabel(payload.viewer.role),
    viewerRole: payload.viewer.role,
    isTitular: payload.viewer.isTitular,
    identity: sectionView(payload.identity),
    status: sectionView(payload.status),
    alerts: sectionView(payload.alerts),
    compliance: sectionView(payload.compliance),
    reminders: sectionView(payload.reminders),
    banners: sectionView(payload.banners),
    cases: sectionView(payload.cases),
    pregnancy: sectionView(payload.pregnancy),
    carousel: sectionView(payload.carousel),
  };
}
