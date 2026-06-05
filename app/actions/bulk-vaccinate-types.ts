// Shared types for bulk vaccination. Kept in a separate module because
// "use server" files cannot export types (Next.js constraint), and client
// components need to import the input shape without crossing a server
// boundary.

export type BulkVaccinateInput = {
  orgToken: string;
  petPublicTokens: string[];
  vaccineName: string;
  occurredAt: string; // ISO date string (YYYY-MM-DD)
  brand?: string | null;
  batch?: string | null;
  administeredBy?: string | null;
  nextDueAt?: string | null;
  bulkActionId?: string;
};
