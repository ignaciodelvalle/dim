"use client";

// Client component: PPP CABA RUPPPA export button.
// Rendered on the pet detail page when:
//   - pet.potentiallyDangerousBreed === true
//   - pet.jurisdictionProvince === "Ciudad Autónoma de Buenos Aires"
//   - The viewer is the pet's owner (accessPath === "owner").
//
// Calls generatePppExportAction and opens the signed URL in a new tab.
// The CABA-only guard is also enforced server-side in the action itself.

import { useState } from "react";

import { generatePppExportAction } from "@/app/actions/ppp-export-caba";

type Props = {
  petPublicToken: string;
};

export function PppExportCabaButton({ petPublicToken }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await generatePppExportAction(petPublicToken);
      if (!result.ok) {
        const errorMap: Record<string, string> = {
          not_found: "Mascota no encontrada o no tenés acceso.",
          pet_not_ppp_for_jurisdiction: "Esta mascota no está marcada como PPP.",
          ppp_prov_ba_not_implemented:
            "El export para Provincia de Buenos Aires estará disponible próximamente.",
          pdf_render_failed: "Error al generar el PDF. Intentá de nuevo.",
          storage_upload_failed:
            "Error al guardar el PDF. Verificá la conectividad con el servidor.",
          signed_url_failed:
            "El PDF se generó pero no se pudo obtener el enlace. Contactá a soporte.",
        };
        setError(errorMap[result.error] ?? "Error al generar el export. Intentá de nuevo.");
      } else {
        setSuccess(true);
        window.open(result.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setError("Error inesperado. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-ln-warn  bg-[#fdf2e0]  text-ln-warn  hover:bg-ln-warn/20  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <svg
              className="animate-spin w-3.5 h-3.5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Generando PDF RUPPPA...
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            Descargar credencial PPP CABA (RUPPPA)
          </>
        )}
      </button>

      {error && <p className="text-[10px] text-ln-err ">{error}</p>}
      {success && (
        <p className="text-[10px] text-ln-ok ">
          PDF generado. Se abrió en una nueva pestaña. El link expira en 24 horas.
        </p>
      )}
      <p className="text-[10px] text-ln-warn ">
        Documento para presentar en la comuna o registro RUPPPA de CABA (Ley 4078).
      </p>
    </div>
  );
}
