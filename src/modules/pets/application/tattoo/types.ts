// Use-case types for createTattooForUser (strangler migration 34/61).

export type EventFormState = { error: string | null };

export type TattooLocation =
  | "inner_ear_left"
  | "inner_ear_right"
  | "inner_thigh"
  | "belly"
  | "other";

export type TattooInput = {
  code: string;
  location: TattooLocation | null;
  description: string | null;
  recordedAt: Date | null;
  recordedBy: string | null;
  uploadedAttachment: { path: string; mimeType: string; size: number };
};

export type CreateTattooResult = { ok: true; eventId: string } | { error: string };
