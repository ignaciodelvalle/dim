// News placeholder. No content source defined yet. Render a friendly
// "próximamente" card so the layout doesn't have a hole.

export function NewsPlaceholder() {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-[var(--color-ln-ink)]">Noticias</h2>
      <div className="border border-dashed border-[var(--color-ln-line-strong)] rounded-xl p-6 text-sm text-[var(--color-ln-ink-2)] space-y-2">
        <p>
          Próximamente: artículos curados sobre cuidado animal, novedades de campañas y normativa
          que afecta a tu mascota.
        </p>
        <p className="text-xs text-[var(--color-ln-mute)]">
          Estamos preparando este espacio. Si tenés sugerencias de qué te gustaría leer, escribinos.
        </p>
      </div>
    </section>
  );
}
