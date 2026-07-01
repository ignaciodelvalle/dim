"use client";

// MergedShareSheet — one "Compartir" sheet (design ADR-7) fusing:
//   1. the public QR link (copy-to-clipboard)
//   2. ShareLibretaSheet (expiring share link)
//   3. Tier2PublicView (temporary medical-view toggle)
//
// `compartir-libreta` and `mostrar-tier2` are kept as deep-link aliases that
// route into this same sheet (SheetMounter wiring) for demo-safety /
// backward-compat with existing links.

import { useState } from "react";

import { ShareLibretaSheet } from "../_share-libreta/ShareLibretaSheet";
import { Tier2PublicView } from "../_tier2-public/Tier2PublicView";

type CreateShareResult = { error: string } | { shareToken: string };

type Tier2Props = {
  isActive: boolean;
  isPermanent: boolean;
  activeUntil: Date | null;
  enableAction: (formData: FormData) => Promise<void>;
  revokeAction: () => Promise<void>;
};

type Props = {
  petPublicToken: string;
  petName: string;
  createShareAction: (
    input: Pick<{ expiresInDays: number | null; label: string | null }, "expiresInDays" | "label">,
  ) => Promise<CreateShareResult>;
  tier2: Tier2Props;
};

function SectionHeading({ children }: { children: string }) {
  return (
    <p className="text-xs uppercase tracking-wider font-semibold text-[var(--color-ln-mute)]">
      {children}
    </p>
  );
}

export function MergedShareSheet({ petPublicToken, petName, createShareAction, tier2 }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopyPublicLink() {
    const url = `${window.location.origin}/p/${petPublicToken}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <SectionHeading>Link público</SectionHeading>
        <p className="text-sm text-[var(--color-ln-ink-2)]">
          Cualquiera con este link ve la credencial pública de {petName}.
        </p>
        <button
          type="button"
          onClick={handleCopyPublicLink}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-3 py-2 text-xs font-medium text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)]"
        >
          {copied ? "¡Copiado!" : "Copiar link público"}
        </button>
      </section>

      <hr className="border-[var(--color-ln-line)]" />

      <section className="space-y-2">
        <SectionHeading>Compartir con vencimiento</SectionHeading>
        <ShareLibretaSheet
          petPublicToken={petPublicToken}
          petName={petName}
          createShareAction={createShareAction}
        />
      </section>

      <hr className="border-[var(--color-ln-line)]" />

      <section className="space-y-2">
        <SectionHeading>Mostrar libreta médica (Tier 2)</SectionHeading>
        <Tier2PublicView
          petPublicToken={petPublicToken}
          petName={petName}
          isActive={tier2.isActive}
          isPermanent={tier2.isPermanent}
          activeUntil={tier2.activeUntil}
          enableAction={tier2.enableAction}
          revokeAction={tier2.revokeAction}
        />
      </section>
    </div>
  );
}
