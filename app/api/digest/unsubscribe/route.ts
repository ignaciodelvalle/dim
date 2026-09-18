// Public unsubscribe endpoint for the daily operator digest (T2-N1) —
// "works without login". The mailed link carries `u` (userId, opaque — not
// PII) and `t` (a signed, non-expiring, per-user token, see
// lib/infra/digest-unsubscribe-token.ts). No session, no cookie, no CSRF
// token: the capability to opt THIS user out lives entirely in the MAC, which
// can never flip any other account's flag.
//
// Idempotent and safe to replay: a second click (or a mail client that
// pre-fetches links) just re-confirms the opt-out. No auth guard from
// lib/infra/auth-guards.ts applies here on purpose — this route is the one
// deliberate exception to "every write is behind a session", the same way
// the denuncia reporter's magic link is (lib/infra/denuncia-reporter-token.ts).

import { type NextRequest, NextResponse } from "next/server";

import { validateDigestUnsubscribeToken } from "@/lib/infra/digest-unsubscribe-token";
import { setDailyDigestOptOutForUser } from "@/src/modules/pets/application/profile/set-daily-digest-opt-out";

function htmlPage(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="es-AR"><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · miMAR</title></head>
    <body style="font-family:system-ui,sans-serif;max-width:480px;margin:64px auto;padding:0 16px;color:#1a1a1a;">
      <h1 style="font-size:20px;">${title}</h1>
      <p>${body}</p>
      <p><a href="/cuenta">Ir a tu cuenta</a></p>
    </body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// @no-auth-required: this endpoint IS the authentication step — the mailed
// link carries a signed, per-user token (validateDigestUnsubscribeToken)
// that is the whole capability, exactly like the denuncia reporter's magic
// link and the seguimiento/entrar route. It must work for someone who never
// had a session, opening the link from an email client.
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("u") ?? "";
  const token = request.nextUrl.searchParams.get("t") ?? "";

  if (!validateDigestUnsubscribeToken(userId, token)) {
    return htmlPage(
      "Enlace inválido",
      "Este enlace para dejar de recibir el resumen diario no es válido o ya no funciona. Podés gestionar esta preferencia desde tu cuenta.",
    );
  }

  try {
    await setDailyDigestOptOutForUser(userId, true);
  } catch (err) {
    console.error("[digest/unsubscribe] failed to opt out", userId, err);
    return htmlPage(
      "No pudimos procesar tu pedido",
      "Ocurrió un error. Probá de nuevo más tarde o gestionalo desde tu cuenta.",
    );
  }

  return htmlPage(
    "Listo",
    "No vas a recibir más el resumen diario de pendientes por correo. Podés reactivarlo cuando quieras desde tu cuenta.",
  );
}
