import Link from "next/link";

// PetCredentialCard — the digital pet ID surface on the owner profile.
//
// Three pieces of info:
//   1) The QR (renders the public credential at /p/{token})
//   2) The publicToken (copyable)
//   3) Link to the public-facing libreta page
//
// QR generation: punted to a server route /p/{token}.png (or .svg) so
// the component itself doesn't need a QR library. The page can render
// an <img src={qrUrl}/> or the component can take a base64 string —
// chose the URL approach to keep this simple and cache-friendly.

interface Props {
  publicToken: string;
  /** Pre-built QR image URL (PNG or SVG). E.g. /p/{token}.png */
  qrUrl: string;
  /** Public credential page URL. E.g. /p/{token} */
  publicHref: string;
}

export function PetCredentialCard({ publicToken, qrUrl, publicHref }: Props) {
  return (
    <section
      aria-labelledby="pp-cred-h"
      className="rounded-2xl border border-gob-border bg-white p-4  "
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="pp-cred-h" className="text-base font-semibold text-gob-text ">
          Identificación digital
        </h2>
        <Link href={publicHref} className="text-xs font-medium text-gob-azul-link hover:underline">
          Ver libreta pública →
        </Link>
      </div>
      <div className="grid grid-cols-[88px_1fr] items-center gap-3">
        <img
          src={qrUrl}
          alt={`QR de la mascota ${publicToken}`}
          width={88}
          height={88}
          className="rounded-lg border border-gob-border bg-white p-1 "
        />
        <div className="min-w-0">
          <p className="text-xs font-medium text-gob-text-muted ">Token público</p>
          <p className="mt-0.5 font-mono text-sm text-gob-text ">{publicToken}</p>
          <p className="mt-2 text-xs text-gob-text-muted ">
            Quien escanee el QR ve la libreta pública.
          </p>
        </div>
      </div>
    </section>
  );
}
