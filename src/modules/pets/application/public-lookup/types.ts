// Exported types for the public pet lookup use-case.

export type PublicLookupResult =
  | { found: false }
  | {
      found: true;
      petName: string;
      petStatus: "active" | "lost" | "deceased";
      /** Owner initials only — e.g. "I.D." — never the full name. */
      ownerInitials: string | null;
    };
