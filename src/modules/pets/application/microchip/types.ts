// Use-case types for replaceMicrochipForUser (strangler migration 13/61).

import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const replaceMicrochipSchema = z.object({
  petId: z.string().uuid(),
  previousChipNumber: z.string().min(1),
  newChipNumber: z.string().nullable(),
  reason: z.enum([
    "damaged",
    "unreadable",
    "duplicate_detected",
    "fraud_detected",
    "owner_request",
    "device_failure",
    "other",
  ]),
  replacedBy: z.string().nullable().optional(),
  replacedAt: z.string(),
  notes: z.string().nullable().optional(),
  actorContext: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("owner") }),
    z.object({ kind: z.literal("vet_in_org"), organizationId: z.string().uuid() }),
    z.object({ kind: z.literal("admin") }),
  ]),
});

export type ReplaceMicrochipInput = z.infer<typeof replaceMicrochipSchema>;

export type ReplaceMicrochipResult =
  | { ok: true; eventId: string; caseId: string | null }
  | { error: string };
