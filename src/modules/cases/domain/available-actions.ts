// available-actions.ts — qué puede hacer un operador sobre un expediente.
//
// LA REGLA: las acciones se DERIVAN del ciclo de vida, nunca se inventan.
//
// El detalle de caso (`components/casos/CaseDetailView.tsx`) tuvo cero controles
// de operador desde que existe — ni cerrar, ni escalar, ni asentar una nota —
// mientras la cola de `/gob/casos` ordena por urgencia en SQL y manda al
// funcionario derecho al expediente más urgente de su jurisdicción. Arreglar el
// orden hizo el callejón MÁS visible, no menos (#41, abierto desde 2026-08-07).
//
// Poner botones era la parte fácil y la trampa: cada uno de los doce kinds
// declara sus propios eventos terminales en
// `src/modules/cases/domain/lifecycles/<kind>.ts`, y un botón que ofrezca una
// transición que el ciclo no declara es peor que no tener botón — le miente al
// operador sobre lo que el sistema va a hacer con un expediente legal.
//
// Este módulo es la única fuente de esa respuesta. Es dominio puro: entra
// (kind, status), sale la lista de acciones. Sin DB, sin framework, sin sesión.
// La autorización va aparte y aguas arriba — esto dice qué es POSIBLE, no quién
// puede.

import type { CaseKind } from "./case-kinds";
import { getLifecycle } from "./lifecycles";
import type { CaseStatus } from "./lifecycles/types";

export type CaseAction =
  /** Asentar texto libre. No cambia el estado. Legítima para los doce kinds. */
  | "note"
  /** Cerrar a mano, sin esperar un evento terminal. Sólo donde el ciclo lo declara. */
  | "close";

export type CaseActionAvailability = {
  action: CaseAction;
  available: boolean;
  /**
   * Por qué NO está disponible, en es-AR, listo para mostrar. `null` cuando sí
   * lo está.
   *
   * No es adorno: la lección repetida de este producto es que una acción que
   * desaparece sin explicación se lee como un error del usuario. Si el operador
   * no puede cerrar, la pantalla tiene que decirle qué lo cierra.
   */
  unavailableReason: string | null;
};

/**
 * Las acciones que el ciclo de vida de `kind` admite sobre un caso en `status`.
 *
 * Devuelve SIEMPRE las dos entradas, disponibles o no. Un llamador que quiera
 * ocultar lo indisponible puede filtrar; uno que quiera explicar por qué falta
 * tiene el motivo a mano. Devolver sólo lo disponible haría imposible lo segundo.
 */
export function availableCaseActions(kind: CaseKind, status: CaseStatus): CaseActionAvailability[] {
  const lifecycle = getLifecycle(kind);
  const isTerminal = status === "closed" || status === "merged";

  // Un kind sin ciclo de vida declarado no habilita NADA que toque el estado.
  // Fallar cerrado es lo único defendible: si el registro no sabe cómo termina
  // este expediente, el producto no puede ofrecerse a terminarlo.
  if (!lifecycle) {
    return [
      isTerminal
        ? {
            action: "note",
            available: false,
            unavailableReason: "El expediente está cerrado.",
          }
        : { action: "note", available: true, unavailableReason: null },
      {
        action: "close",
        available: false,
        unavailableReason:
          "Este tipo de expediente no tiene un ciclo de vida declarado, así que el sistema no sabe cómo se cierra.",
      },
    ];
  }

  const note: CaseActionAvailability = isTerminal
    ? {
        action: "note",
        available: false,
        unavailableReason:
          status === "merged"
            ? "Este expediente se fusionó con otro. Las notas van en el expediente que quedó abierto."
            : "El expediente está cerrado. Para dejar constancia de algo nuevo, hay que reabrir el caso o abrir uno nuevo.",
      }
    : { action: "note", available: true, unavailableReason: null };

  let close: CaseActionAvailability;
  if (isTerminal) {
    close = {
      action: "close",
      available: false,
      unavailableReason: "El expediente ya está cerrado.",
    };
  } else if (!lifecycle.manualCloseAllowed) {
    // El motivo nombra QUÉ lo cierra, no sólo que el botón no está. Un
    // funcionario que sabe que el expediente se cierra solo cuando el animal
    // sale de custodia no vuelve tres veces a buscar el botón.
    const terminals = lifecycle.terminalEvents.join(", ");
    close = {
      action: "close",
      available: false,
      unavailableReason: terminals
        ? `Este tipo de expediente no se cierra a mano: se cierra solo cuando ocurre el hecho que lo termina (${terminals}).`
        : "Este tipo de expediente no admite cierre manual.",
    };
  } else {
    close = { action: "close", available: true, unavailableReason: null };
  }

  return [note, close];
}

/** Atajo para el caso más frecuente: ¿puede este operador hacer X acá? */
export function canPerformCaseAction(
  kind: CaseKind,
  status: CaseStatus,
  action: CaseAction,
): boolean {
  return availableCaseActions(kind, status).some((a) => a.action === action && a.available);
}
