import { BrandedNotFound } from "@/components/BrandedNotFound";

// CSP × PRERENDER (external design review C3-P1 / X1-F2).
//
// The middleware mints a per-request CSP nonce and the policy carries
// `'strict-dynamic'`, which makes the browser IGNORE `'self'` for scripts and
// execute ONLY what is nonce'd. A prerendered page's HTML is written at build
// time with no nonce at all, so in production 100% of its JavaScript is
// refused: the page renders (SSR markup) and arrives dead — no hydration, no
// error boundaries, a wall of red in the console.
//
// force-dynamic takes this route out of the prerender set so Next stamps the
// request's nonce into its <script> tags. Verified against the build output:
// `.next/server/app/*.html` must stay empty.
export const dynamic = "force-dynamic";

// ROOT not-found — catches ALL unmatched URLs app-wide (e.g. /admin/zzz,
// /gob/zzz, /foo). Next renders THIS for an unmatched route; a nested
// not-found.tsx only catches an explicit notFound() thrown within its segment.
// Without this root file, unmatched URLs fell to Next's black English default
// ("This page could not be found"). Admin fresh-sweep A1 / dashboards deep-dive D7.
export default function RootNotFound() {
  return (
    <BrandedNotFound
      title="No encontramos esta página"
      body="La dirección que buscás no existe o cambió de lugar. Revisá el enlace o volvé al inicio."
      primary={{ href: "/", label: "Volver al inicio" }}
    />
  );
}
