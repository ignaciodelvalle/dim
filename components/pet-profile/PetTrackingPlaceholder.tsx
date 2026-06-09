import Link from "next/link";

// PetTrackingPlaceholder — "Add a tracking device" CTA.
//
// Lives on the owner pet profile until DIM ships a real integration with
// a GPS-collar vendor (Tractive, Fi, Whistle, etc.). The card is large
// and obvious by design — the user flagged this as IMPORTANT.
//
// Once a device is paired, the placeholder is replaced by the actual
// `PetTrackingCard` (live location, battery, geofence) — that's Phase 2.

interface Props {
  /** Where the pairing flow lives. Stub for now. */
  href: string;
}

export function PetTrackingPlaceholder({ href }: Props) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-dashed border-ln-ok bg-gradient-to-br from-[#eef6f0] to-ln-celeste/10 p-5 text-center transition-colors hover:from-[#eef6f0] hover:to-ln-celeste/10    "
    >
      <p className="mb-1 text-3xl" aria-hidden>
        📍
      </p>
      <p className="text-sm font-semibold text-ln-ink ">Seguí a tu mascota en tiempo real</p>
      <p className="mt-1 text-xs text-ln-ink-2 ">
        Conectá un dispositivo de tracking GPS para ver ubicación y zonas seguras.
      </p>
      <span className="mt-3 inline-block rounded-full bg-ln-ok px-4 py-1.5 text-xs font-semibold text-white">
        Conectar dispositivo
      </span>
    </Link>
  );
}
