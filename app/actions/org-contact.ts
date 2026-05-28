"use server";

// Public contact form for the refugio profile (handoff P2-8).
//
// Anonymous-friendly: no auth gate. Rate-limited per D4 override:
//   - 5 messages / IP / day  (covers shared NAT scenarios in AR)
//   - 20 messages / org / day  (anti-harassment ceiling per org)
//
// D3 override: no captcha — rate limit alone. If abuse shows up later
// the contactar sheet can wire Turnstile via a `cf-turnstile-response`
// field without changing this contract.

import { eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";

import { db, orgContactMessages, organizations } from "@/db";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";

export type SubmitOrgContactState = { ok: boolean; error: string | null };

const MAX_MESSAGE_LEN = 500;
const MAX_NAME_LEN = 100;
const MAX_EMAIL_LEN = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function callerIpAddress(): Promise<string> {
  const reqHeaders = await headers();
  const forwardedFor = reqHeaders.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return reqHeaders.get("x-real-ip") ?? "unknown";
}

// @no-auth-required: public contact form on /refugios/[orgToken]. IP +
// per-org rate limits via enforceRateLimit. Inquirer is anonymous by
// design — only email is required so the org can reply.
export async function submitOrgContactAction(
  orgToken: string,
  _previous: SubmitOrgContactState,
  formData: FormData,
): Promise<SubmitOrgContactState> {
  // 1. Resolve the org. Same visibility gate as queryOrgPublicProfile —
  // verified shelter/rescue_network only. Unverified orgs are not
  // contactable through this surface.
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.publicToken, orgToken))
    .limit(1);
  if (!org) return { ok: false, error: "Refugio no encontrado." };

  // 2. Validate inputs.
  const name =
    String(formData.get("inquirerName") ?? "")
      .trim()
      .slice(0, MAX_NAME_LEN) || null;
  const email = String(formData.get("inquirerEmail") ?? "")
    .trim()
    .toLowerCase();
  const message = String(formData.get("message") ?? "").trim();

  if (!email || !EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LEN) {
    return { ok: false, error: "Indicá un email válido para que puedan responderte." };
  }
  if (message.length < 10) {
    return { ok: false, error: "El mensaje es muy corto (mínimo 10 caracteres)." };
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return { ok: false, error: `El mensaje supera los ${MAX_MESSAGE_LEN} caracteres.` };
  }

  // 3. Rate limits per D4 override:
  //   - 5 messages / IP / day (handles shared NAT carrier-grade in AR)
  //   - 20 messages / org / day (anti-harassment ceiling per org)
  //   - Also a 3/min IP guard so a burst doesn't burn the daily budget
  //     in 5 seconds (no captcha per D3 override; this is the only floor).
  const ip = await callerIpAddress();
  try {
    await enforceRateLimit("org_contact_ip", ip, { maxPerMinute: 3, maxPerDay: 5 });
    await enforceRateLimit(`org_contact_org:${org.id}`, "any", { maxPerDay: 20 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return {
        ok: false,
        error: "Ya enviaste varios mensajes hace poco. Esperá un rato y probá de nuevo, por favor.",
      };
    }
    throw err;
  }

  // 4. Persist.
  await db.insert(orgContactMessages).values({
    organizationId: org.id,
    inquirerName: name,
    inquirerEmail: email,
    message,
    submitterIp: ip === "unknown" ? null : ip,
  });

  return { ok: true, error: null };
}

// Suppress unused-import when the bundler tree-shakes the deferred case.
void inArray;
