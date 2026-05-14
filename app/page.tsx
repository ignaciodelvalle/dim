export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-6xl font-bold tracking-tight">DIM</h1>
        <p className="text-xl text-[color:var(--color-muted)]">
          Documento de Identificación para Mascotas
        </p>
        <p className="text-base text-[color:var(--color-muted-foreground)] max-w-md mx-auto leading-relaxed">
          La credencial digital de salud para tu mascota. Para encontrarse, para cuidarse, para
          ayudarnos a cuidar a todas.
        </p>
        <p className="text-xs text-[color:var(--color-muted-foreground)] mt-12 tracking-widest uppercase">
          v0.1.0 · scaffolding · más por venir
        </p>
      </div>
    </main>
  );
}
