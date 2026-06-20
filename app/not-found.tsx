import { BrandedNotFound } from "@/components/BrandedNotFound";

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
