// Use-case types for libreta-share writers (strangler migration 32/61).

export type CreateShareInput = {
  petPublicToken: string;
  expiresInDays: number | null; // null = no expiration
  label: string | null;
};

export type CreateShareResult = { error: string } | { shareToken: string };
export type RevokeShareResult = { error: string } | { ok: true };
