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

import { unknownEnumLabel } from "../ui/enum-label";

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
    default:
      // An alert id the client does not know is a payload from a newer server.
      // The row is still shown — an alert the owner cannot see is worse than one
      // they cannot fully read — but the raw id is NOT: `open-cases` in
      // parentheses is an internal identifier in a citizen's wallet, and it told
      // them nothing the sentence does not already say. See `ui/enum-label.ts`.
      return unknownEnumLabel(alert.id, "Tiene un aviso que esta versión no sabe mostrar");
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
    default:
      // A role from a newer server. The sentence still answers the question the
      // line exists for — WHY parts of this face are missing — without printing
      // `org_member`-shaped English at somebody. See `ui/enum-label.ts`.
      return unknownEnumLabel(role, "Tenés acceso a esta mascota");
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
  /**
   * When the server composed this read, from the payload ENVELOPE rather than
   * from any one section — so it survives a section that failed, which is the
   * point: the credential's foot states when the document was issued, and a
   * document that cannot say that is not one.
   */
  issuedAt: string;
};

// ---------------------------------------------------------------------------
// What the face may offer (A3-documento-credencial-04)
// ---------------------------------------------------------------------------

/**
 * The web's own action gates, computed from the two facts the payload carries
 * and this face was ignoring: `status.data.petStatus` and who the viewer is.
 *
 * WHAT WAS WRONG. The footer gated on `viewerRole` for the ORG path only, so a
 * titular whose animal is registered as fallecida was offered a red "Modo
 * perdida" pill and "Transferir la titularidad" — the second answers 409 "Abrí
 * su ficha para ver por qué" while the person IS in the ficha — and a co-owner,
 * a foster or the neighbour caring for the dog filled in the whole transfer form
 * before a refusal the browser never lets them reach. Two "Disponible en la web"
 * rows pointed at pages the web hides for a deceased animal, which is worse than
 * a dead row: it is a promise about somewhere else.
 *
 * THE GATES ARE THE WEB'S, LINE FOR LINE. `PetActionRow.tsx:43-67` for the row
 * (person path AND not deceased for Anotar/Editar; plus `petStatus === "active"`
 * for Marcar como perdida) and `MasSheet.helpers.ts:67-118` for the sheet (the
 * deceased early-return keeps corrections and who-to-call and nothing else;
 * Transferir and Cuidador require `ownershipRole === "owner"` AND an active
 * animal). `isTitular` IS that `ownershipRole === "owner"` — the contract says
 * so and says a co-owner is deliberately false there.
 *
 * MODO PERDIDA IS THE ONE DELIBERATE DIVERGENCE. The web drops it on a LOST
 * animal because "Marcar como encontrada" lives prominently in its
 * `LostCaseBlock`; this app has no such block — the row IS the cockpit for both
 * directions — so it stays for `lost` and goes only for `deceased`.
 *
 * A FAILED STATUS READ TAKES NOTHING AWAY. `unavailable` means the server could
 * not read the section, which is this file's founding distinction, so an outage
 * must not remove a control: the client gates only on what it KNOWS, and the
 * server refusal is still the backstop it always was.
 */
export type OwnerFaceGates = {
  /** KNOWN to be fallecida. False while the status section failed to load. */
  isDeceased: boolean;
  /**
   * KNOWN to be in a situation other than `active` — lost or deceased. An
   * UNREAD status is neither `isDeceased` nor this: both are phrased as "the
   * server said so", which is what keeps an outage from removing a control.
   */
  isNotActive: boolean;
  /** `ownershipRole === "owner"`: a co-owner is deliberately NOT one. */
  isTitular: boolean;
  canRecordEvent: boolean;
  canOpenLostMode: boolean;
  canEditIdentity: boolean;
  /** The who-to-call row. Same audience as `canEditIdentity` — one destination. */
  canSeeEmergencyContacts: boolean;
  /**
   * The foster's "Buscar hogar" row and the titular's "Acompañamiento de
   * adopción" row — ONE destination, two labels, and two DIFFERENT audiences
   * (finding F2, review 2026-09-07).
   *
   * They are two gates rather than an if/else on the role because the else arm
   * is what went wrong: it covered `owner` AND `co_owner` AND `org_member`, so a
   * co-owner read "Acompañamiento de adopción — Disponible en la web", opened a
   * browser and got a 404. `buscar-hogar/page.tsx` filters its ownership row to
   * `owner` or `foster` and `notFound()`s everything else, and the web's own row
   * gates on `ownershipRole === "owner"` (`MasSheet.helpers.ts:134-146`) for
   * exactly that reason — a titular tapped a live row and got a 404 on
   * 2026-08-20, and this is the same defect on the role axis.
   */
  canSeeFindHome: boolean;
  canSeeAdoptionSupport: boolean;
  canTransfer: boolean;
  canDesignateCaretaker: boolean;
  canOpenReturn: boolean;
  /** The "Disponible en la web" / "Próximamente" rows, which the web hides on a
   *  deceased animal — its `chapita` row sits AFTER the deceased early-return,
   *  and page.tsx nulls the data behind it. */
  showWebOnlyRows: boolean;
};

export function ownerFaceGates(view: {
  viewerRole: OwnerPetDetailViewerRole;
  isTitular: boolean;
  status: SectionView<OwnerPetStatusSection>;
}): OwnerFaceGates {
  // `null` = the section did not load. Every gate below reads it as "no fact",
  // never as "not active": the permissive direction is the correct one here
  // because the server refusal is still in place behind every one of them.
  const petStatus = view.status.state === "ok" ? view.status.data.petStatus : null;
  const isDeceased = petStatus === "deceased";
  const isNotActive = petStatus !== null && petStatus !== "active";
  const isCaretaker = view.viewerRole === "caretaker";
  return {
    isDeceased,
    isNotActive,
    isTitular: view.isTitular,
    canRecordEvent: !isDeceased,
    canOpenLostMode: !isDeceased,
    canEditIdentity: !isCaretaker,
    canSeeEmergencyContacts: !isCaretaker,
    canSeeFindHome: view.viewerRole === "foster" && !isDeceased,
    canSeeAdoptionSupport: view.isTitular && !isDeceased,
    canTransfer: view.isTitular && !isNotActive,
    canDesignateCaretaker: view.isTitular && !isNotActive,
    canOpenReturn: !isDeceased,
    showWebOnlyRows: !isDeceased,
  };
}

/**
 * WHY a titular-only row is inert, in one short line under its label.
 *
 * `null` when the row is live. The two reasons are kept apart because the moves
 * are different: a co-owner has to ask the titular, and a titular whose animal
 * is lost has to find it first.
 */
export function titularOnlyRowCaption(gates: OwnerFaceGates): string | null {
  if (!gates.isTitular) return "Solo el titular";
  if (gates.isNotActive) return "No se puede en esta situación";
  return null;
}

export function buildOwnerFaceView(payload: OwnerPetDetailV1): OwnerFaceView {
  return {
    publicToken: payload.publicToken,
    issuedAt: payload.issuedAt,
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
