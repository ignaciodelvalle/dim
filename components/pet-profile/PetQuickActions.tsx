import Link from "next/link";

type Props = {
  petPublicToken: string;
  petStatus: "active" | "lost" | "deceased";
  preferredVetPhone: string | null;
};

export function PetQuickActions({ petPublicToken, petStatus, preferredVetPhone }: Props) {
  const base = `/mis-mascotas/${petPublicToken}`;

  return (
    <div className="flex flex-wrap gap-2" data-section="quick-actions">
      {/* Modo perdido — active → marcar-perdida; lost → marcar-encontrada; deceased → hidden */}
      {petStatus === "active" && (
        <Link
          href={`${base}?sheet=marcar-perdida`}
          className="inline-flex items-center justify-center min-h-9 px-4 text-sm font-semibold rounded-full transition-colors bg-transparent text-gob-danger border-[3px] border-gob-danger hover:bg-gob-danger hover:text-white active:translate-y-px"
        >
          Modo perdido
        </Link>
      )}
      {petStatus === "lost" && (
        <Link
          href={`${base}?sheet=marcar-encontrada`}
          className="inline-flex items-center justify-center min-h-9 px-4 text-sm font-semibold rounded-full transition-colors bg-gob-success text-white border-0 hover:bg-gob-success-hover active:translate-y-px"
        >
          Marcar encontrada
        </Link>
      )}

      {/* Compartir QR — opens public credential in new tab */}
      <Link
        href={`/p/${petPublicToken}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center min-h-9 px-4 text-sm font-semibold rounded-full transition-colors bg-white text-gob-primary border-[3px] border-gob-border hover:border-gob-border-strong active:translate-y-px"
      >
        Compartir QR
      </Link>

      {/* Llamar vet — tel: link when phone is set, disabled otherwise */}
      {preferredVetPhone ? (
        <a
          href={`tel:${preferredVetPhone}`}
          className="inline-flex items-center justify-center min-h-9 px-4 text-sm font-semibold rounded-full transition-colors bg-white text-gob-primary border-[3px] border-gob-border hover:border-gob-border-strong active:translate-y-px"
        >
          Llamar vet
        </a>
      ) : (
        <span
          className="inline-flex items-center justify-center min-h-9 px-4 text-sm font-semibold rounded-full bg-white text-gob-primary border-[3px] border-gob-border opacity-50 cursor-not-allowed"
          aria-disabled="true"
          title="No tenés un vet de cabecera configurado. Editá tu cuenta para agregarlo."
        >
          Llamar vet
        </span>
      )}
    </div>
  );
}
