// ConfirmChipMatchResult — result type for the chip-match confirmation use-case.

export type ConfirmChipMatchResult =
  | {
      ok: true;
      custodyEventId?: string;
      /**
       * Adjudication receipt for a `not_same` decision (RA-2 F6).
       *
       * The actor has just been shown the conflicting record and said it is a
       * different animal. `chipConflict` carries the disputed code plus an
       * HMAC-signed force token bound to it, so the alta they are sent back to
       * can complete instead of running the same cross-check and bouncing them
       * to this very page again. Absent for `same`.
       */
      chipConflict?: { microchipId: string; forceToken: string };
    }
  | { error: string };
