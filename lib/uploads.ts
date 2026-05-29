import { randomUUID } from "node:crypto";

const MAX_BYTES = 5 * 1024 * 1024;

export type UploadResult = {
  uploadedPath: string | null;
  mimeType: string | null;
  size: number | null;
  error: string | null;
};

// Accept any Supabase client that exposes a `.storage` property — covers both
// the cookie-bound SSR client (@supabase/ssr) and the service-role admin
// client (@supabase/supabase-js). Anonymous server actions need the admin
// client to bypass the `to authenticated` RLS policy on the bucket.
type SupabaseStorageClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        file: File,
        options?: { contentType?: string },
      ): Promise<{ error: { message: string } | null }>;
    };
  };
};

export async function uploadAttachmentIfPresent(
  supabase: SupabaseStorageClient,
  file: File | null,
  bucket: string,
): Promise<UploadResult> {
  if (!file || file.size === 0) {
    return { uploadedPath: null, mimeType: null, size: null, error: null };
  }
  if (!file.type.startsWith("image/")) {
    return {
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: "El archivo debe ser una imagen.",
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: "La imagen no puede superar los 5 MB.",
    };
  }
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const filename = `${randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filename, file, { contentType: file.type });
  if (uploadError) {
    return {
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: `No se pudo subir la imagen: ${uploadError.message}`,
    };
  }
  return { uploadedPath: filename, mimeType: file.type, size: file.size, error: null };
}
