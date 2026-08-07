"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * The credential's pet photo, with a fallback for a URL that FAILS TO LOAD.
 *
 * The page already fell back when there was no photo row at all, but that is a
 * render-time conditional: it cannot see a `storagePath` that still resolves to
 * a URL whose object is gone (deleted from the bucket, expired signature, a
 * storage outage). In that case next/image rendered a broken-image glyph on the
 * single most public page in the product — the one every QR scan lands on.
 *
 * A client component is the only way to get `onError`, so the whole photo block
 * lives here rather than duplicating the placeholder markup across the server
 * page and this file.
 *
 * `priority` still preloads correctly: next/image emits its preload link during
 * SSR, before any of this hydrates.
 */
export function CredentialPhoto({ src, petName }: { src: string | null; petName: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="pc-photo-placeholder">
        <span className="pc-photo-placeholder-initial">{petName.charAt(0).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={petName}
      width={460}
      height={345}
      priority
      sizes="(max-width: 480px) 100vw, 460px"
      className="block w-full aspect-[4/3] object-cover"
      onError={() => setFailed(true)}
    />
  );
}
