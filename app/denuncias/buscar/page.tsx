import Link from "next/link";
import { SearchForm } from "./SearchForm";

export default function BuscarDenunciaPage() {
  return (
    <main className="p-6 bg-white">
      <div className="max-w-md mx-auto pt-10 space-y-8">
        <header className="space-y-1">
          <Link
            href="/"
            className="text-sm text-gob-text-muted hover:text-gob-text transition-colors"
          >
            ← Inicio
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-gob-text">
            Buscar mi denuncia
          </h1>
          <p className="text-sm text-gob-text-gray">
            Si denunciaste de forma anónima, podés volver a tu denuncia con el código que recibiste
            al enviarla.
          </p>
        </header>

        <SearchForm />
      </div>
    </main>
  );
}
