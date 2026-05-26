// PetTrackingPlaceholder — visibility-only card for the future GPS tracking
// feature. Not clickable: the `/tracking` route does not exist yet (Phase 2
// pairing flow). Once a real integration ships, this gets replaced by the
// actual `PetTrackingCard` (live location, battery, geofence).

export function PetTrackingPlaceholder() {
  return (
    <div className="block rounded-2xl border border-dashed border-emerald-500 bg-gradient-to-br from-emerald-50 to-blue-50 p-5 text-center dark:from-emerald-950/30 dark:to-blue-950/30">
      <p className="mb-1 text-3xl" aria-hidden>
        📍
      </p>
      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
        Seguí a tu mascota en tiempo real
      </p>
      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
        Estamos integrando dispositivos de tracking GPS para ver ubicación y zonas seguras.
      </p>
      <span className="mt-3 inline-block rounded-full bg-emerald-600/80 px-4 py-1.5 text-xs font-semibold text-white">
        Próximamente
      </span>
    </div>
  );
}
