// Standalone /cuenta/casos page removed (owner-ia-redesign P1 item 5).
// Transitional redirect — /inicio's "Casos abiertos" section (#casos anchor)
// is the interim destination until P5's real index+inbox lands with a proper
// history view. NOTE (discovered while wiring this): the deleted page also
// rendered CLOSED/past cases via fetchPreviousWorkflows — /inicio only ever
// fetches OPEN workflows, so that history view has no home until P5. PO-locked
// as an accepted transitional gap (plan explicitly calls this redirect
// "transitional" pending the P5 inbox).

import { redirect } from "next/navigation";

export default function CasosPage() {
  redirect("/inicio#casos");
}
