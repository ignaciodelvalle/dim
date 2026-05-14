// Storage path → public URL helper. The pet-photos bucket is public, so we
// can construct URLs deterministically without a round-trip through the
// Supabase client.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function petPhotoUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/pet-photos/${storagePath}`;
}
