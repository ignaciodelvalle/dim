// News placeholder. No content source defined yet. Render a friendly
// "próximamente" card so the layout doesn't have a hole.

export function NewsPlaceholder() {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-gob-text ">Noticias</h2>
      <div className="border border-dashed border-gob-border-strong  rounded-xl p-6 text-sm text-gob-text-gray  space-y-2">
        <p>
          Próximamente: artículos curados sobre cuidado animal, novedades de campañas y normativa
          que afecta a tu mascota.
        </p>
        <p className="text-xs text-gob-text-muted ">
          Estamos preparando este espacio. Si tenés sugerencias de qué te gustaría leer, escribinos.
        </p>
      </div>
    </section>
  );
}
