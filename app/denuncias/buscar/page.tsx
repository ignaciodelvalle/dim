import Link from "next/link";
import { SearchForm } from "./SearchForm";

export default function BuscarDenunciaPage() {
  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-10 space-y-8">
        <header className="space-y-1">
          <Link
            href="/"
            className="text-sm text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
          >
            ← Inicio
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Buscar mi denuncia
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Si denunciaste de forma anónima, podés volver a tu denuncia con el código que recibiste
            al enviarla.
          </p>
        </header>

        <SearchForm />
      </div>
    </main>
  );
}
