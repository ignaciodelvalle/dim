/**
 * Wave 2 Item 9 — SuccessScreen for mordedura (trámite-style flow).
 *
 * Rule 4: "Denuncia, adoption application, intake, devolución, mordedura, and
 * similar bureaucratic flows MUST end on LnSuccessScreen."
 *
 * Shown after reportBiteAction succeeds. Explains the 10-day rabies observation
 * period and surfaces the two relevant next steps.
 */

import { LnSheetCard, LnSheetWrap } from "@/components/ui/Sheet";
import { LnSuccessScreen } from "@/components/ui/SuccessScreen";
import { requireOwnedPetByToken } from "@/lib/pets";

export default async function BiteSuccessPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  // Auth guard: only the owner can see this page (same guard as the form).
  await requireOwnedPetByToken(publicToken);

  return (
    <LnSheetWrap>
      <LnSheetCard>
        <LnSuccessScreen
          title="Mordedura registrada"
          description="Queda registrado en la libreta oficial. Comienza el período de observación antirrábica obligatoria de 10 días (Decreto 4669/1973 PBA, Ord. CABA 41.831/1987)."
          next={[
            {
              label: "Ver perfil de la mascota",
              href: `/mis-mascotas/${publicToken}`,
              variant: "primary",
            },
            {
              label: "Ver historial de eventos",
              href: `/mis-mascotas/${publicToken}/historial`,
              variant: "secondary",
            },
          ]}
        />
      </LnSheetCard>
    </LnSheetWrap>
  );
}
