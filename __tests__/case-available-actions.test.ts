/**
 * Tests para src/modules/cases/domain/available-actions.ts (#41).
 *
 * Lo que se prueba NO es "los botones aparecen": es que la lista de acciones
 * sale del ciclo de vida y no de una lista escrita a mano. Por eso los casos
 * recorren los DOCE kinds reales leyendo sus declaraciones, en vez de afirmar
 * contra un puñado elegido.
 */

import { describe, expect, it } from "vitest";

import {
  availableCaseActions,
  canPerformCaseAction,
} from "@/src/modules/cases/domain/available-actions";
import { CASE_KINDS } from "@/src/modules/cases/domain/case-kinds";
import { getLifecycle } from "@/src/modules/cases/domain/lifecycles";

describe("availableCaseActions — la nota", () => {
  it("está disponible en TODOS los kinds abiertos", () => {
    // La nota no es una transición: no toca el estado ni pretende ser un evento
    // terminal. Por eso es legítima para los doce, y es la única acción que
    // sirve al 100% de la cola real.
    for (const kind of CASE_KINDS) {
      expect(canPerformCaseAction(kind, "open", "note"), `${kind} no admite nota`).toBe(true);
    }
  });

  it("desaparece en un expediente cerrado, y dice por qué", () => {
    const [note] = availableCaseActions("custody_episode", "closed");
    expect(note.available).toBe(false);
    expect(note.unavailableReason).toMatch(/cerrado/i);
  });

  it("distingue cerrado de fusionado en el motivo", () => {
    const [cerrado] = availableCaseActions("custody_episode", "closed");
    const [fusionado] = availableCaseActions("custody_episode", "merged");
    expect(fusionado.unavailableReason).not.toBe(cerrado.unavailableReason);
    expect(fusionado.unavailableReason).toMatch(/fusion/i);
  });
});

describe("availableCaseActions — el cierre manual se DERIVA del ciclo de vida", () => {
  // Éste es el test que importa. Si alguien habilita un cierre manual en la UI
  // sin declararlo en el ciclo, o al revés, esto se pone rojo.
  it("coincide exactamente con manualCloseAllowed, kind por kind", () => {
    for (const kind of CASE_KINDS) {
      const lifecycle = getLifecycle(kind);
      const declarado = lifecycle?.manualCloseAllowed ?? false;
      expect(canPerformCaseAction(kind, "open", "close"), `${kind}`).toBe(declarado);
    }
  });

  it("hoy lo admite exactamente un kind, y es custody_episode", () => {
    // Fija el estado del 2026-08-10. Si mañana son dos, este test obliga a
    // pasar por acá y decir cuál — que es la fricción que corresponde para una
    // acción que cierra un expediente legal.
    const conCierreManual = CASE_KINDS.filter((k) => canPerformCaseAction(k, "open", "close"));
    expect(conCierreManual).toEqual(["custody_episode"]);
  });

  it("cuando no se puede cerrar a mano, el motivo NOMBRA qué lo cierra", () => {
    // Un motivo que sólo dice "no se puede" manda al operador a buscar el botón
    // tres veces. Nombrar el evento terminal cierra la pregunta.
    const [, close] = availableCaseActions("lost_pet_episode", "open");
    expect(close.available).toBe(false);
    const terminales = getLifecycle("lost_pet_episode")?.terminalEvents ?? [];
    expect(terminales.length).toBeGreaterThan(0);
    for (const t of terminales) {
      expect(close.unavailableReason).toContain(t);
    }
  });

  it("un expediente ya cerrado no ofrece cerrarse otra vez", () => {
    const [, close] = availableCaseActions("custody_episode", "closed");
    expect(close.available).toBe(false);
    expect(close.unavailableReason).toMatch(/ya está cerrado/i);
  });
});

describe("no vacuidad", () => {
  it("hay doce kinds y todos tienen ciclo de vida declarado", () => {
    // Sin esto, los barridos de arriba podrían recorrer una lista vacía y pasar
    // sin haber juzgado nada — el modo de falla que tres fences de este repo
    // tuvieron esta misma semana.
    expect(CASE_KINDS.length).toBeGreaterThanOrEqual(12);
    for (const kind of CASE_KINDS) {
      expect(getLifecycle(kind), `${kind} sin ciclo de vida`).not.toBeNull();
    }
  });

  it("siempre devuelve las dos acciones, disponibles o no", () => {
    // Devolver sólo lo disponible haría imposible explicar la ausencia, que es
    // justamente lo que la pantalla necesita.
    for (const kind of CASE_KINDS) {
      for (const status of ["open", "escalated", "closed", "merged"] as const) {
        const acciones = availableCaseActions(kind, status);
        expect(acciones.map((a) => a.action).sort()).toEqual(["close", "note"]);
        for (const a of acciones) {
          if (a.available) expect(a.unavailableReason).toBeNull();
          else expect(a.unavailableReason?.length ?? 0).toBeGreaterThan(10);
        }
      }
    }
  });
});
