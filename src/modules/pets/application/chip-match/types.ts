// ConfirmChipMatchResult — result type for the chip-match confirmation use-case.

export type ConfirmChipMatchResult = { ok: true; custodyEventId?: string } | { error: string };
