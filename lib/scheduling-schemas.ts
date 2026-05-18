// Zod schemas for scheduling system forms. These validate user-facing input
// (server action arguments) — NOT event payloads, which live in lib/event-schemas.ts.

import { z } from "zod";

export const CreateServiceOfferingInput = z.object({
  serviceKind: z.string().min(1),
  displayName: z.string().min(3).max(120),
  description: z.string().max(500).nullable(),
  durationMinutes: z.number().int().min(5).max(480),
  slotCapacity: z.number().int().min(1).max(100),
  priceArs: z.number().nonnegative().nullable(),
  eligibilitySpecies: z.array(z.enum(["dog", "cat"])).nullable(),
  eligibilityAgeMinMonths: z.number().int().min(0).max(360).nullable(),
  eligibilityAgeMaxMonths: z.number().int().min(0).max(360).nullable(),
});

export type CreateServiceOfferingInputType = z.infer<typeof CreateServiceOfferingInput>;

export const CreateScheduleRuleInput = z
  .object({
    serviceOfferingId: z.string().uuid(),
    daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1),
    startTimeLocal: z.string().regex(/^\d{2}:\d{2}$/),
    endTimeLocal: z.string().regex(/^\d{2}:\d{2}$/),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    effectiveUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  })
  .refine((d) => d.endTimeLocal > d.startTimeLocal, {
    message: "endTimeLocal must be after startTimeLocal",
  });

export const BookSlotInput = z.object({
  slotId: z.string().uuid(),
  petPublicToken: z.string().min(1),
  notesFromOwner: z.string().max(500).nullable(),
});

export const MarkAttendedInput = z.object({
  appointmentPublicToken: z.string().min(1),
  // Service-kind-specific fields are validated separately at action time.
});
