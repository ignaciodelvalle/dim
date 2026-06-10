// PetTrackingPlaceholder — visibility-only card for the future GPS tracking
// feature. Not clickable: the `/tracking` route does not exist yet (Phase 2
// pairing flow). Once a real integration ships, this gets replaced by the
// actual `PetTrackingCard` (live location, battery, geofence).

export function PetTrackingPlaceholder() {
  return (
    <div className="block rounded-2xl border border-dashed border-ln-ok bg-gradient-to-br from-[var(--color-ln-ok-050)] to-ln-celeste/10 p-5 text-center">
      <p className="mb-1 text-3xl" aria-hidden>
        📍
      </p>
      <p className="text-sm font-semibold text-ln-ink">Seguí a tu mascota en tiempo real</p>
      <p className="mt-1 text-xs text-ln-ink-2">
        Estamos integrando dispositivos de tracking GPS para ver ubicación y zonas seguras.
      </p>
      <span className="mt-3 inline-block rounded-full bg-ln-ok/80 px-4 py-1.5 text-xs font-semibold text-white">
        Próximamente
      </span>
    </div>
  );
}
