// Domain types for the decomiso (Ley 14.346) module.
// Pure value shapes — no DB, no framework.

export type SeizureMotive =
  | "maltrato_fisico"
  | "abandono_extremo"
  | "acumulacion"
  | "trafico"
  | "sin_refugio_critico"
  | "pelea_de_perros"
  | "otro";

/** Descriptive fields for an unowned stray animal. */
export interface UnownedAnimalInput {
  species: string;
  sex: "male" | "female" | "unknown";
  breed?: string | null;
  color?: string | null;
  distinguishingFeatures?: string | null;
  approxAgeMonths?: number | null;
}

export interface ExecuteDecomisoInput {
  subjectKind: "registered_pet" | "unowned_animal";
  petPublicToken?: string | null;
  unownedAnimal?: UnownedAnimalInput | null;
  seizureMotive: SeizureMotive;
  seizureMotiveOtherDetail?: string | null;
  judicialProceedingReference?: string | null;
  originatingWelfareReportId?: string | null;
  intendedReceiverOrganizationId: string;
  intakeCondition?: string | null;
  attachmentFiles: File[];
}

export type GovtOrg = {
  id: string;
  displayName: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
};

export type ReceiverOrg = {
  id: string;
  displayName: string;
  verified: boolean | null;
  status: string;
  orgType: string;
};

export type NewNotification = {
  userId: string;
  notificationType: string;
  title: string;
  body: string;
  severity: "info" | "success" | "warning" | "urgent";
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  relatedPetId?: string | null;
  relatedCaseId?: string | null;
};

export type UseCaseResult<T = void> =
  | { ok: true; value: T; notifications: NewNotification[] }
  | { ok: false; error: string };

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB per DC5
export const ATTACHMENT_BUCKET = "pet-attachments";
export const ALLOWED_SPECIES = ["dog", "cat", "other"];
