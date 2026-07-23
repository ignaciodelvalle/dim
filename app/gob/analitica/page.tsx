// /gob/analitica — bug fix (qa-triage-2026-07-23, finding #11): the correctly
// spelled route is /gob/analytics (nav uses it, no typo there), but nothing
// caught the honest human typo "analitica" — it 404'd. This route now
// permanently redirects to /gob/analytics, forwarding every original search
// param untouched (same param-preserving pattern as
// lib/ui/denuncias-hub-redirect.ts's buildDenunciasHubRedirectUrl, simplified
// here since there is no stage/etapa param to inject — this is a pure
// typo-route alias, not a hub absorption).

import { redirect } from "next/navigation";

export default async function GobAnaliticaRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else {
      qs.set(key, value);
    }
  }
  const query = qs.toString();
  redirect(query ? `/gob/analytics?${query}` : "/gob/analytics");
}
