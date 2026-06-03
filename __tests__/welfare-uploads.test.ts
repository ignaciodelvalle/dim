// Unit tests for uploadWelfareEvidence validation and upload logic.
// Supabase storage is mocked so no real bucket is required.

import { describe, expect, it, vi } from "vitest";

import { uploadWelfareEvidence } from "@/lib/welfare-uploads";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  const bytes = new Uint8Array(sizeBytes);
  return new File([bytes], name, { type });
}

type FakeSupabase = Parameters<typeof uploadWelfareEvidence>[0];

function makeSupabase(uploadError: string | null = null): FakeSupabase {
  const uploadMock = vi.fn(async () => ({
    error: uploadError ? { message: uploadError } : null,
  }));
  return {
    storage: { from: () => ({ upload: uploadMock }) },
    uploadMock,
  } as unknown as FakeSupabase;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("uploadWelfareEvidence", () => {
  it("returns empty result when files array is empty", async () => {
    const supabase = makeSupabase();
    const result = await uploadWelfareEvidence(supabase, "report-id-1", []);
    expect(result.error).toBeNull();
    expect(result.uploaded).toHaveLength(0);
    expect(result.uploadedPaths).toHaveLength(0);
  });

  it("returns an error when more than 5 files are provided", async () => {
    const supabase = makeSupabase();
    const files = Array.from({ length: 6 }, (_, i) => makeFile(`photo${i}.jpg`, "image/jpeg"));
    const result = await uploadWelfareEvidence(supabase, "report-id-2", files);
    expect(result.error).toMatch(/5/);
    expect(result.uploaded).toHaveLength(0);
  });

  it("returns an error for disallowed MIME type", async () => {
    const supabase = makeSupabase();
    const result = await uploadWelfareEvidence(supabase, "report-id-3", [
      makeFile("doc.pdf", "application/pdf"),
    ]);
    expect(result.error).toBeTruthy();
    expect(result.uploaded).toHaveLength(0);
  });

  it("returns an error when a file exceeds 25 MB", async () => {
    const supabase = makeSupabase();
    const tooBig = makeFile("big.jpg", "image/jpeg", 26 * 1024 * 1024);
    const result = await uploadWelfareEvidence(supabase, "report-id-4", [tooBig]);
    expect(result.error).toMatch(/25 MB/);
    expect(result.uploaded).toHaveLength(0);
  });

  it("uploads a valid image and returns the storage path and metadata", async () => {
    const supabase = makeSupabase();
    const file = makeFile("evidence.jpg", "image/jpeg", 2048);
    const result = await uploadWelfareEvidence(supabase, "report-id-5", [file]);
    expect(result.error).toBeNull();
    expect(result.uploaded).toHaveLength(1);
    expect(result.uploadedPaths).toHaveLength(1);
    const u = result.uploaded[0];
    expect(u.storagePath).toMatch(/^report-id-5\//);
    expect(u.storagePath).toMatch(/\.jpg$/);
    expect(u.mimeType).toBe("image/jpeg");
    expect(u.fileSize).toBe(2048);
    expect(u.originalFilename).toBe("evidence.jpg");
  });

  it("uploads multiple valid files and returns all paths", async () => {
    const supabase = makeSupabase();
    const files = [
      makeFile("a.jpg", "image/jpeg"),
      makeFile("b.png", "image/png"),
      makeFile("c.mp4", "video/mp4"),
    ];
    const result = await uploadWelfareEvidence(supabase, "report-id-6", files);
    expect(result.error).toBeNull();
    expect(result.uploaded).toHaveLength(3);
    expect(result.uploadedPaths).toHaveLength(3);
  });

  it("rolls back already-uploaded files and returns an error when Supabase upload fails", async () => {
    let callCount = 0;
    const removeMock = vi.fn(async () => ({ error: null }));
    const supabase = {
      storage: {
        from: () => ({
          upload: vi.fn(async () => {
            callCount++;
            if (callCount > 1) return { error: { message: "storage quota exceeded" } };
            return { error: null };
          }),
          remove: removeMock,
        }),
      },
    } as unknown as FakeSupabase;
    const result = await uploadWelfareEvidence(supabase, "report-id-7", [
      makeFile("ok.jpg", "image/jpeg"),
      makeFile("fail.jpg", "image/jpeg"),
    ]);
    expect(result.error).toMatch(/storage quota exceeded/);
    expect(result.uploaded).toHaveLength(0);
    expect(removeMock).toHaveBeenCalledOnce();
  });

  it("filters out zero-byte File entries silently", async () => {
    const supabase = makeSupabase();
    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    const real = makeFile("real.jpg", "image/jpeg");
    const result = await uploadWelfareEvidence(supabase, "report-id-8", [empty, real]);
    expect(result.error).toBeNull();
    expect(result.uploaded).toHaveLength(1);
    expect(result.uploaded[0].originalFilename).toBe("real.jpg");
  });
});
