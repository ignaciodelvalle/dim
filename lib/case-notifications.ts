// Case-aware notification emitter. Wraps the `notifications` table insert
// with template resolution + recipient fan-out so callers (server actions,
// cron jobs) don't have to repeat the same boilerplate per template.
//
// Usage:
//
//   await emitCaseNotification({
//     templateId: "lost_episode_match_proposed_owner",
//     recipients: [{ userId: ownerId }],
//     vars: { pet_name: "Toto", org_name: "Refugio X", public_code: caseCode,
//             pet_public_token: petToken },
//     relatedCaseId: caseId,
//     relatedPetId: petId,
//     relatedEventId: eventId, // optional
//   });
//
// One row per recipient. The DB index `notifications_user_unread_idx`
// makes the per-user fetch cheap.

import { db, notifications } from "@/db";
import {
  type CaseNotificationTemplateId,
  renderCaseNotificationTemplate,
} from "./notification-templates";

export interface CaseNotificationRecipient {
  userId: string;
  /** Optional per-recipient overrides for any `{{placeholder}}` in the template. */
  vars?: Record<string, string | number>;
}

export interface EmitCaseNotificationInput {
  templateId: CaseNotificationTemplateId;
  recipients: ReadonlyArray<CaseNotificationRecipient>;
  /** Shared vars applied to every recipient. Recipient-level vars override. */
  vars?: Record<string, string | number>;
  relatedCaseId: string;
  relatedPetId?: string | null;
  relatedEventId?: string | null;
  /** Optional explicit expiry; default null (persistent). */
  expiresAt?: Date | null;
}

export async function emitCaseNotification(input: EmitCaseNotificationInput): Promise<void> {
  if (input.recipients.length === 0) return;

  const rows = input.recipients.map((recipient) => {
    const mergedVars = { ...(input.vars ?? {}), ...(recipient.vars ?? {}) };
    const rendered = renderCaseNotificationTemplate(input.templateId, mergedVars);
    return {
      userId: recipient.userId,
      notificationType: input.templateId,
      title: rendered.title,
      body: rendered.body,
      severity: rendered.severity,
      ctaLabel: rendered.ctaLabel,
      ctaUrl: rendered.ctaUrl,
      relatedPetId: input.relatedPetId ?? null,
      relatedEventId: input.relatedEventId ?? null,
      relatedCaseId: input.relatedCaseId,
      expiresAt: input.expiresAt ?? null,
    };
  });

  await db.insert(notifications).values(rows);
}
