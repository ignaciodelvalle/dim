// Re-export shim. This file is the original home of reference code helpers.
// Its content has been extracted to:
//   src/modules/welfare/domain/reference-code.ts
//
// This shim preserves the @/lib/welfare-codes import path for all existing
// importers (client components and server actions). Do NOT delete until all
// importers have been repointed (WU-4 strangler step).

export {
  generateReferenceCode,
  isValidReferenceCodeFormat,
  normalizeReferenceCode,
} from "@/src/modules/welfare/domain/reference-code";
