// outbound-channels — which ways OUT of the system are actually wired, and what
// breaks for a real person when one is not.
//
// WHY THIS EXISTS
// `lib/infra/env.ts` deliberately does NOT validate feature-scoped secrets at
// boot (see its header): forcing RESEND_API_KEY at startup would break every
// environment that has not turned mail on yet. That decision is right, and it
// leaves a hole this module fills — nothing anywhere reported whether the mail
// channel was live, so the only way to find out was for a citizen to press
// "Enviarme el enlace" and never receive it.
//
// That specific silence matters more than it looks. Since the denuncia code
// page stopped rendering report content (PO decision, 2026-08-17), the emailed
// access link is the ONLY route a reporter without an account has to their own
// denuncia. `solicitarAccesoDenunciaAction` returns the same neutral message on
// every branch — on purpose, so the endpoint cannot be used as an existence
// oracle — which means an unconfigured mailer and a successful send are
// INDISTINGUISHABLE to the person waiting. The anti-oracle property is correct
// and must not be weakened; the readiness signal therefore has to surface
// somewhere else, to an operator, ahead of time. That somewhere is
// /admin/sistema.
//
// WHAT THIS DOES NOT CLAIM
// Presence of a key is not proof of delivery. A configured Resend account can
// still reject every message — unverified sending domain, suspended account,
// bounced address. So `configured` means exactly "the app can attempt a send",
// never "mail arrives", and the copy on the card says so. Overclaiming here
// would rebuild, one layer up, the same false comfort this module was written
// to remove.

/** A way the system can reach a person who is not looking at a screen. */
export type OutboundChannelKey = "email" | "sms" | "webPush";

export type OutboundChannelStatus =
  /** The app can attempt a send. Says nothing about whether it arrives. */
  | "configured"
  /** Wiring exists but this environment has not been given its secrets. */
  | "unconfigured"
  /** No implementation exists at all — not a deployment gap, a product gap. */
  | "not-built";

export type OutboundChannel = {
  key: OutboundChannelKey;
  /** es-AR label for the operator screen. */
  label: string;
  status: OutboundChannelStatus;
  /**
   * Env var names this channel needs. NAMES ONLY — a value never leaves the
   * server and never reaches this object, so the card can be rendered without
   * putting a secret one React tree away from the browser.
   */
  requires: readonly string[];
  /**
   * What a real person loses while this channel is down, in concrete terms.
   * Written as a consequence, not a feature list: an operator reading this
   * screen needs to know who is stranded, not which module is off.
   */
  consequence: string;
};

/** Read-only view of the env; injectable so tests never mutate process.env. */
export type EnvLike = Record<string, string | undefined>;

function present(env: EnvLike, name: string): boolean {
  return (env[name] ?? "").trim().length > 0;
}

/**
 * Derives channel readiness from environment presence. Pure: takes the env as
 * an argument rather than reading the global, so the whole table is testable
 * without touching process.env.
 */
export function deriveOutboundChannels(env: EnvLike): OutboundChannel[] {
  const emailKeys = ["RESEND_API_KEY"] as const;
  const pushKeys = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"] as const;

  return [
    {
      key: "email",
      label: "Correo electrónico",
      status: emailKeys.every((k) => present(env, k)) ? "configured" : "unconfigured",
      requires: emailKeys,
      consequence:
        "Sin esto, quien denunció y dejó un email no recibe el enlace para ver el estado de su denuncia. La pantalla le dice lo mismo de siempre, así que espera un correo que nunca sale. También queda sin enviarse la entrega de exportaciones analíticas.",
    },
    {
      key: "webPush",
      label: "Notificaciones push",
      // Both halves of the VAPID pair are required; one alone is a
      // misconfiguration, not a partial capability.
      status: pushKeys.every((k) => present(env, k)) ? "configured" : "unconfigured",
      requires: pushKeys,
      consequence:
        "Sin esto, los avisos push no salen. Alcanza solo a quien ya tiene sesión y aceptó notificaciones en su navegador: nunca a un denunciante anónimo.",
    },
    {
      key: "sms",
      label: "SMS",
      // Not a deployment gap. There is no app-level SMS sender: the Twilio
      // block in supabase/config.toml belongs to Supabase Auth's own OTP, not
      // to us. Declared here so nobody writes copy promising an SMS.
      status: "not-built",
      requires: [],
      consequence:
        "No existe envío de SMS en la aplicación. Quien denunció dejando solo un teléfono no tiene ninguna vía digital de vuelta: debe presentar su código de constancia ante el organismo.",
    },
  ];
}

/**
 * True when every channel that COULD be configured in this environment is.
 * `not-built` channels are excluded: a product gap must not be reportable as
 * an environment failure an operator could fix by pasting a key.
 */
export function outboundChannelsReady(channels: readonly OutboundChannel[]): boolean {
  return channels.every((c) => c.status !== "unconfigured");
}
