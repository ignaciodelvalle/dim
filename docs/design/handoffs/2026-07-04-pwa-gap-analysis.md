# PWA Gap Analysis — MiMAR

> Date: 2026-07-04 · Scope: what exists vs. what the PWA-first strategy
> (decided 2026-07-04: citizens+orgs on installable PWA, offline credential as
> the killer feature, no native app until push/Mi Argentina demands) requires.
> Method: filesystem + dependency + layout inspection. Read-only.

## Verdict

**The PWA layer does not exist yet.** The app is mobile-first in *layout*
(AppShell, sheets, touch targets) but has zero installability or offline
machinery. Findings:

| Capability | Status | Evidence |
|---|---|---|
| Web manifest | ❌ absent | no `app/manifest.ts`, no `public/manifest.*` |
| Service worker | ❌ absent | no `public/sw.js`, no workbox/serwist/next-pwa dep |
| Install prompt / A2HS | ❌ absent | no `beforeinstallprompt` handling |
| Offline behavior | ❌ none | any request without network = browser error page |
| PWA meta (apple-touch-icon, theme-color) | ❌ absent | `app/layout.tsx` exports only `viewport` |
| Mobile-first layouts | ✅ shipped | AppShell, sheets, 44px targets, skeletons |
| App icon source | ✅ available | project logo delivered 2026-07-03 (fingerprint mark) |

## Why the offline credential matters (the product argument)

The QR on the chapita is paper — it works offline by definition. The gap is
the OWNER side: showing the credential/libreta on a phone at a vet's counter
or a rural checkpoint **without signal**. That is a real Argentine scenario
(urban dead zones, rural coverage) and it is the single feature that makes
"install MiMAR" worth a home-screen slot. Nobody installs a web page; people
install the thing that holds their pet's papers.

## Phased path (smallest slice first)

### Fase A — Installable (≈ half day)
- `app/manifest.ts` (Next 15 native, zero deps): name/short_name MiMAR,
  `display: standalone`, `start_url: /inicio`, theme/background from LN
  tokens, icons 192/512 + maskable from the project logo.
- `apple-touch-icon` + `theme-color` metadata in the root layout.
- Verify Lighthouse "installable" passes.
- No behavior change; pure additive.

### Fase B — Offline credential (2–3 days, the real feature)
- Service worker via **serwist** (workbox successor, maintained Next
  integration; hand-rolled SW is the fallback if the dep fights Next 15.5).
- Precache: app shell chunks + LN CSS + fonts.
- Runtime cache (stale-while-revalidate): `/mis-mascotas/[token]/credencial`
  + credential QR SVGs + primary pet photos for pets the owner has VIEWED.
- Offline fallback page (es-AR): "Sin conexión — tu credencial guardada sigue
  disponible" listing cached credentials.
- Privacy note: cache lives in the browser profile of the logged-in owner —
  same trust boundary as the session cookie; nothing new leaks. Cache is
  keyed to the session and cleared on logout.
- Testing: Playwright offline mode (`context.setOffline(true)`) asserting the
  credential renders from cache.

### Fase C — Push (later; do not start)
- Ties into the reminders/notifications engine (vaccine_due). Android PWA
  push is mature; iOS 16.4+ works but with limits. Revisit after deploy when
  notification volume is real. This is also the first genuine trigger to
  reconsider a native app — not before.

## Deploy interaction

Fase A can ship in the first Vercel deploy (manifest is static). Fase B
SHOULD wait until after the preview deploy is stable — a service worker adds
a caching layer that complicates debugging fresh deploys; introduce it once
the baseline is boring.

## Open questions for the PO

1. Fase A icon treatment: full-bleed logo vs. padded maskable — needs a quick
   visual pass on the delivered logo file.
2. Should the PUBLIC credential (`/p/[token]`) also cache offline on the
   finder's phone after a scan? Useful (finder loses signal walking the dog
   home) but it caches someone else's pet data on a stranger's device —
   privacy call, default NO until reviewed against §privacy checklist.
