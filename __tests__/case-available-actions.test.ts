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
  describeTerminalEvents,
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

  it("cuando no se puede cerrar a mano, el motivo NOMBRA el hecho en castellano", () => {
    // Un motivo que sólo dice "no se puede" manda al operador a buscar el botón
    // tres veces. Nombrar el hecho terminal cierra la pregunta.
    const [, close] = availableCaseActions("lost_pet_episode", "open");
    expect(close.available).toBe(false);
    expect(close.unavailableReason).toMatch(/no se cierra a mano/i);
    // `status_changed` y `custody_transferred`, dichos como los vive el operador.
    expect(close.unavailableReason).toMatch(/cambia el estado del animal/i);
    expect(close.unavailableReason).toMatch(/cambia de responsable/i);
  });

  it("NINGÚN motivo filtra un identificador de evento crudo", () => {
    // La versión original de este módulo interpolaba `terminalEvents` directo, y
    // en staging se leía textual: "se cierra solo cuando ocurre el hecho que lo
    // termina (custody_dispute_resolved)". Un identificador en inglés, en la
    // copia de un expediente legal, contra el invariante #4 — y justo en la
    // frase que existe para que la ausencia del botón se ENTIENDA.
    //
    // El test viejo hacía `expect(reason).toContain(eventType)`: no sólo dejaba
    // pasar el defecto, lo EXIGÍA. Éste afirma lo contrario, sobre los doce
    // kinds y los dos estados.
    const idsCrudos = new Set<string>();
    for (const kind of CASE_KINDS) {
      for (const e of getLifecycle(kind)?.terminalEvents ?? []) idsCrudos.add(e);
    }
    expect(idsCrudos.size, "hay eventos terminales que revisar").toBeGreaterThan(5);

    for (const kind of CASE_KINDS) {
      for (const status of ["open", "closed"] as const) {
        for (const a of availableCaseActions(kind, status)) {
          const reason = a.unavailableReason ?? "";
          for (const id of idsCrudos) {
            expect(reason, `${kind}/${status} filtra "${id}"`).not.toContain(id);
          }
          // Ningún snake_case en general, no sólo los que hoy conocemos.
          expect(reason, `${kind}/${status} tiene forma de identificador`).not.toMatch(
            /[a-z]+_[a-z]+/,
          );
        }
      }
    }
  });

  it("un evento terminal sin prosa degrada a la frase genérica, no al identificador", () => {
    // La garantía que hace que lo de arriba siga siendo cierto mañana: agregar
    // un evento nuevo a un ciclo de vida empeora la explicación, nunca la
    // convierte en jerga.
    expect(describeTerminalEvents(["custody_transferred"])).toBe("el animal cambia de responsable");
    expect(describeTerminalEvents([])).toBeNull();
    expect(
      describeTerminalEvents(["custody_transferred", "evento_inventado" as never]),
      "un evento sin traducir invalida la enumeración entera",
    ).toBeNull();
  });

  it("un expediente ya cerrado no ofrece cerrarse otra vez", () => {
    const [, close] = availableCaseActions("custody_episode", "closed");
    expect(close.available).toBe(false);
    expect(close.unavailableReason).toMatch(/ya está cerrado/i);
  });
});

describe("availableCaseActions — un expediente que se cierra por ACCIÓN lo dice, no manda a escalar", () => {
  // rehome-by-titular (WU5 carry-forward 2). `rehome_request` no tiene evento
  // terminal ni cierre manual: lo cierran dos ACCIONES — la respuesta de la
  // organización y la cancelación del titular. Con `terminalEvents: []` el
  // detalle le decía a la org "todavía no tiene una vía de cierre definida…
  // pedí que se defina la política", que es falso: la política existe y la
  // org es quien la ejecuta.
  it("rehome_request: el motivo nombra a la organización y al titular, nunca 'sin vía de cierre'", () => {
    const [, close] = availableCaseActions("rehome_request", "open");
    expect(close.available).toBe(false);
    expect(close.unavailableReason).not.toMatch(/todavía no tiene una vía de cierre/i);
    expect(close.unavailableReason).toMatch(/no se cierra a mano/i);
    expect(close.unavailableReason).toMatch(/organización/i);
    expect(close.unavailableReason).toMatch(/titular/i);
  });

  it("el ciclo de vida lo declara en un campo legible por máquina, no en un comentario", () => {
    // Derivado, no restatado: si mañana la prosa vive sólo en el header del
    // archivo, este test vuelve a ponerse rojo.
    expect(getLifecycle("rehome_request")?.actionCloseProse).toMatch(/organización/);
    expect(getLifecycle("rehome_request")?.actionCloseProse).toMatch(/titular/);
  });

  it("un kind sin política escrita sigue pidiendo la decisión (microchip_remediation)", () => {
    // Triangulación: el campo nuevo sólo cambia la frase donde alguien lo
    // escribió. Donde nadie escribió la política, la frase sigue siendo la
    // honesta — no hay vía de cierre, pedí que se defina.
    const lifecycle = getLifecycle("microchip_remediation");
    expect(lifecycle?.terminalEvents).toHaveLength(0);
    expect(lifecycle?.actionCloseProse).toBeUndefined();
    const [, close] = availableCaseActions("microchip_remediation", "open");
    expect(close.unavailableReason).toMatch(/todavía no tiene una vía de cierre/i);
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
