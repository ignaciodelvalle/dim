"use client";

import { useState } from "react";

import { Sheet } from "@/components/poncho/Sheet";
import { buildCloseSheetUrl } from "@/components/poncho/Sheet.helpers";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// "Compartir refugio" — copy-link + native share (handoff P2-9).

interface Props {
  orgToken: string;
  orgDisplayName: string;
}

export function CompartirOrgSheet({ orgToken, orgDisplayName }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState(false);

  const open = searchParams.get("sheet") === "compartir-org";
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/refugios/${orgToken}`
      : `https://mimar.ar/refugios/${orgToken}`;
  const shareText = `Conocé ${orgDisplayName} en MiMAR. Tienen mascotas en adopción y servicios para la comunidad.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable, ignore */
    }
  }

  async function nativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: orgDisplayName, text: shareText, url });
      } catch {
        /* user dismissed */
      }
    }
  }

  return (
    <Sheet
      id="compartir-org"
      title={`Compartir ${orgDisplayName}`}
      open={open}
      onClose={() => router.replace(buildCloseSheetUrl(pathname, searchParams))}
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-gob-text-gray">
          Compartí este link con quien quieras: vecinos, redes, grupos de WhatsApp.
        </p>

        <div className="rounded-xl border border-gob-border bg-gob-surface-alt p-3 text-xs font-mono break-all text-gob-text">
          {url}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={copy}
            className="w-full rounded-lg bg-gob-primary text-white text-sm font-semibold px-4 py-2.5 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-celeste focus-visible:ring-offset-2"
          >
            {copied ? "✓ Link copiado" : "Copiar link"}
          </button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              type="button"
              onClick={nativeShare}
              className="w-full rounded-lg border border-gob-border text-gob-text text-sm font-medium px-4 py-2.5 hover:bg-gob-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-celeste focus-visible:ring-offset-2"
            >
              Más opciones para compartir…
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
