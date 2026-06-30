// Public pet lookup for anonymous flows (handoff P4-2a).
//
// Wraps lib/chip-lookup with IP rate-limit and returns a minimal,
// non-leaky projection so anon users (denuncia wizard) can confirm
// "this microchip / token belongs to a registered pet" without
// exposing the owner record.
//
// Two query modes auto-detected from input shape:
//   - 15 digits → microchip
//   - DIM-XXXX-XXXX → public token
//   - anything else → not_found (no fuzzy matching to avoid scraping)

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db, ownerships, pets, profiles } from "@/db";
import { lookupByChip } from "@/lib/chip-lookup";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/rate-limit";

import type { PublicLookupResult } from "./types";

const MICROCHIP_PATTERN = /^\d{15}$/;
const TOKEN_PATTERN = /^DIM-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

async function callerIpAddress(): Promise<string> {
  try {
    const reqHeaders = await headers();
    return callerIp(reqHeaders);
  } catch {
    return "unknown";
  }
}

function deriveInitials(displayName: string | null): string | null {
  if (!displayName) return null;
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts
    .slice(0, 2)
    .map((p) => `${p[0]?.toUpperCase() ?? ""}.`)
    .join("");
}

// @no-auth-required: public lookup for the denuncia anon wizard.
// Returns ONLY {found, petName, petStatus, ownerInitials} — never the
// full pet record, owner email, address, etc. Rate-limited per IP
// (60/min, 200/hour) to prevent enumeration scraping.
export async function lookupPetForDenuncia(query: string): Promise<PublicLookupResult> {
  const trimmed = query.trim().toUpperCase();
  if (!trimmed) return { found: false };

  const ip = await callerIpAddress();
  try {
    await enforceRateLimit("denuncia_lookup", ip, { maxPerMinute: 60, maxPerHour: 200 });
  } catch (err) {
    if (err instanceof RateLimitError) return { found: false };
    throw err;
  }

  // Microchip path — uses the existing helper with the partial index.
  if (MICROCHIP_PATTERN.test(trimmed)) {
    const result = await lookupByChip(trimmed);
    if (!result) return { found: false };
    return {
      found: true,
      petName: result.pet.name,
      petStatus: result.pet.status,
      ownerInitials: deriveInitials(result.ownerFirstName),
    };
  }

  // Token path — direct query against pets.public_token + leftJoin owner.
  if (TOKEN_PATTERN.test(trimmed)) {
    const [row] = await db
      .select({
        petName: pets.name,
        petStatus: pets.status,
        ownerDisplayName: profiles.displayName,
      })
      .from(pets)
      .leftJoin(ownerships, eq(ownerships.petId, pets.id))
      .leftJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
      .where(eq(pets.publicToken, trimmed))
      .limit(1);
    if (!row) return { found: false };
    return {
      found: true,
      petName: row.petName,
      petStatus: row.petStatus as "active" | "lost" | "deceased",
      ownerInitials: deriveInitials(row.ownerDisplayName),
    };
  }

  return { found: false };
}
