// Regulations placeholder. We don't have a content collection of
// per-locality laws/ordinances yet. We DO know each living pet's
// (province, locality) from pets.jurisdiction* — so the placeholder
// lists those as the precursor: when the regs collection lands, this
// widget filters it down to those localities automatically.

export function RegulationsPlaceholder({
  localities,
}: {
  localities: Array<{ province: string; locality: string | null }>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-[var(--color-ln-ink)]">Normativa por localidad</h2>
      <div className="border border-dashed border-[var(--color-ln-line-strong)] rounded-xl p-6 text-sm text-[var(--color-ln-ink-2)] space-y-3">
        {localities.length === 0 ? (
          <>
            <p>
              Cuando agregues la ubicación de tus mascotas, te vamos a mostrar acá las leyes y
              ordenanzas locales que las afectan (microchip obligatorio, razas reguladas, requisitos
              de adopción, etc.).
            </p>
            <p className="text-xs text-[var(--color-ln-mute)]">
              Andá a Mis mascotas → editar → Ubicación.
            </p>
          </>
        ) : (
          <>
            <p>
              Estamos preparando un listado de normativa específica para las localidades donde viven
              tus mascotas:
            </p>
            <ul className="space-y-1 text-[var(--color-ln-ink-2)]">
              {localities.map((l) => (
                <li key={`${l.province}|${l.locality ?? ""}`} className="text-sm">
                  <span className="font-medium">
                    {l.locality ? `${l.locality}, ${l.province}` : l.province}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-[var(--color-ln-mute)] pt-1">
              Mientras tanto, conocé el marco general: Ley 14.346 (maltrato animal), Decreto
              4669/1973 (rabia), Ley 26.858 (perros de asistencia).
            </p>
          </>
        )}
      </div>
    </section>
  );
}
