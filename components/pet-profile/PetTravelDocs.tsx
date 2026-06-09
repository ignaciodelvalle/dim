import Link from "next/link";

// PetTravelDocs — pasaporte sanitario + certificados internacionales.
//
// V1: two slots — pasaporte sanitario (always shown) and certificado
// internacional (shown if uploaded, otherwise a "subir" CTA in its
// place). Both surfaces are attachments in `welfare_report_attachments`
// or a future `pet_attachments` table — TBD which.

export type PetDocRow = {
  id: string;
  kind: "pasaporte" | "certificado_internacional" | "otro";
  label: string;
  /** "vence 04/2028" or "no cargado" */
  caption: string;
  href: string | null;
};

interface Props {
  docs: PetDocRow[];
  /** Page to upload a new document. */
  uploadHref: string;
}

const KIND_ICON: Record<PetDocRow["kind"], string> = {
  pasaporte: "📘",
  certificado_internacional: "🌎",
  otro: "📄",
};

export function PetTravelDocs({ docs, uploadHref }: Props) {
  return (
    <section
      aria-labelledby="pp-docs-h"
      className="rounded-2xl border border-ln-line bg-ln-card p-4  "
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="pp-docs-h" className="text-base font-semibold text-ln-ink ">
          Documentos de viaje
        </h2>
        <Link href={uploadHref} className="text-xs font-medium text-ln-azul hover:underline">
          Subir →
        </Link>
      </div>
      {docs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ln-line-strong p-6 text-center text-sm text-ln-mute ">
          Sin documentos cargados. Si viajás, subí pasaporte sanitario o certificado internacional.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {docs.map((d) => (
            <li key={d.id}>
              {d.href ? (
                <Link
                  href={d.href}
                  className="block rounded-lg border border-ln-line p-3 transition-colors hover:bg-ln-stripe  "
                >
                  <DocBody d={d} />
                </Link>
              ) : (
                <div className="rounded-lg border border-dashed border-ln-line-strong p-3 ">
                  <DocBody d={d} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DocBody({ d }: { d: PetDocRow }) {
  return (
    <>
      <p className="text-sm font-medium text-ln-ink ">
        <span aria-hidden className="mr-1">
          {KIND_ICON[d.kind]}
        </span>
        {d.label}
      </p>
      <p className="mt-0.5 text-xs text-ln-mute ">{d.caption}</p>
    </>
  );
}
