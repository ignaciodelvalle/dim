/**
 * El endpoint que hace que un error del navegador llegue a alguien.
 *
 * LO QUE SE PRUEBA NO ES "devuelve 204". Es que un endpoint PÚBLICO que escribe
 * en el log que el equipo lee no acepte cualquier cosa: un log inundado es un
 * log donde la línea que importaba no se encuentra, y eso es indistinguible de
 * no haberla escrito nunca.
 */

import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enforceRateLimit = vi.fn(async () => {});

vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: (...args: unknown[]) =>
      enforceRateLimit(...(args as Parameters<typeof enforceRateLimit>)),
  };
});

const reportError = vi.fn();
vi.mock("@/lib/infra/report-error", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

import { POST } from "@/app/api/telemetry/client-error/route";
import { RateLimitError } from "@/lib/infra/rate-limit";

/**
 * Un `Request` común presentado como `NextRequest`.
 *
 * El handler sólo usa `.headers` y `.text()`, que un `Request` tiene: el cast
 * atraviesa `unknown` en vez de `any` para que siga siendo un cast puntual y no
 * un agujero por el que pase cualquier cosa sin que el compilador diga nada.
 */
function post(body: unknown, raw?: string): NextRequest {
  return new Request("http://localhost:3000/api/telemetry/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: raw ?? JSON.stringify(body),
  }) as unknown as NextRequest;
}

const VALID = {
  message: "Cannot read properties of undefined",
  name: "TypeError",
  stack: "TypeError: boom\n    at Foo (app.js:1:1)",
  digest: "1234567890",
  context: { source: "error-boundary", correlationId: "abc-123" },
  ts: "2020-01-01T00:00:00.000Z",
};

beforeEach(() => {
  enforceRateLimit.mockReset();
  enforceRateLimit.mockResolvedValue(undefined);
  reportError.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/telemetry/client-error", () => {
  it("acepta un reporte bien formado y lo reemite por el reporter del servidor", async () => {
    const res = await POST(post(VALID));

    expect(res.status).toBe(204);
    expect(reportError).toHaveBeenCalledTimes(1);

    const [context, err, meta] = reportError.mock.calls[0];
    expect(context).toBe("client");
    expect((err as Error).message).toBe(VALID.message);
    expect((err as Error).name).toBe("TypeError");
    expect(meta).toMatchObject({
      source: "error-boundary",
      surface: "browser",
      digest: "1234567890",
    });
  });

  it("IGNORA el ts del cliente", async () => {
    // Una marca de tiempo que el llamador elige es una marca de tiempo que el
    // llamador puede usar para ordenar su línea en otro lado del log.
    await POST(post(VALID));
    const [, , meta] = reportError.mock.calls[0];
    expect(meta).not.toHaveProperty("ts");
    expect(JSON.stringify(meta)).not.toContain("2020-01-01");
  });

  it("rechaza un reporte sin mensaje: no dice nada y ensucia el log", async () => {
    for (const body of [{}, { message: "" }, { message: "   " }, { message: 42 }]) {
      reportError.mockReset();
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      expect(reportError).not.toHaveBeenCalled();
    }
  });

  it("rechaza un cuerpo que no es un objeto JSON", async () => {
    for (const raw of ["no soy json", "[1,2,3]", '"texto"', "null"]) {
      const res = await POST(post(undefined, raw));
      expect(res.status).toBe(400);
    }
  });

  it("corta los campos largos en vez de dejar que inunden el log", async () => {
    // Por debajo de MAX_BODY_BYTES a propósito: lo que este caso juzga son los
    // topes POR CAMPO, y un cuerpo de 20 KB los saltea porque el tope de cuerpo
    // gana primero — que es lo que pasó al escribirlo.
    await POST(
      post({
        message: "x".repeat(5000),
        stack: "y".repeat(8000),
      }),
    );

    const [, err] = reportError.mock.calls[0];
    expect((err as Error).message.length).toBe(500);
    expect(((err as Error).stack ?? "").length).toBeLessThanOrEqual(4000);
  });

  it("rechaza un cuerpo enorme antes de parsearlo", async () => {
    const res = await POST(post(undefined, JSON.stringify({ message: "a".repeat(20_000) })));
    expect(res.status).toBe(413);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("el contexto acepta primitivos y NADA más", async () => {
    await POST(
      post({
        message: "boom",
        context: {
          ok: "texto",
          num: 7,
          si: true,
          anidado: { no: "esto serializaría a profundidad arbitraria" },
          lista: [1, 2, 3],
          fn: null,
          infinito: Number.POSITIVE_INFINITY,
          "clave con espacios": "descartada",
        },
      }),
    );

    const [, , meta] = reportError.mock.calls[0];
    expect(meta).toMatchObject({ ok: "texto", num: 7, si: true });
    expect(meta).not.toHaveProperty("anidado");
    expect(meta).not.toHaveProperty("lista");
    expect(meta).not.toHaveProperty("fn");
    expect(meta).not.toHaveProperty("infinito");
    expect(meta).not.toHaveProperty("clave con espacios");
  });

  it("acota la CANTIDAD de claves de contexto", async () => {
    const context: Record<string, string> = {};
    for (let i = 0; i < 100; i += 1) context[`k${i}`] = "v";

    await POST(post({ message: "boom", context }));

    const [, , meta] = reportError.mock.calls[0];
    // 20 del contexto + `surface`, que agrega la ruta.
    expect(Object.keys(meta as object)).toHaveLength(21);
  });

  it("devuelve 429 cuando el llamador se pasó de presupuesto, sin escribir nada", async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitError(new Date(), "minute"));

    const res = await POST(post(VALID));

    expect(res.status).toBe(429);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("si el limitador MISMO falla, el reporte pasa igual", async () => {
    // Un endpoint de telemetría que falla cerrado ante un hipo de su propia
    // infraestructura pierde exactamente los reportes que produce un mal
    // despliegue, que son los que más importan.
    enforceRateLimit.mockRejectedValueOnce(new Error("la tabla de cupos no responde"));

    const res = await POST(post(VALID));

    expect(res.status).toBe(204);
    // Dos llamadas: la del fallo del limitador y la del reporte del cliente.
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(reportError.mock.calls[0][0]).toBe("telemetry/client-error:rate-limit");
    expect(reportError.mock.calls[1][0]).toBe("client");
  });

  it("limita ANTES de leer el cuerpo", async () => {
    // Un llamador pasado de presupuesto no debería lograr que el servidor
    // parsee 16 KB para enterarse de eso.
    enforceRateLimit.mockRejectedValueOnce(new RateLimitError(new Date(), "minute"));
    const res = await POST(post(undefined, JSON.stringify({ message: "a".repeat(20_000) })));
    // 429, no 413: el límite ganó la carrera porque corre primero.
    expect(res.status).toBe(429);
  });
});
