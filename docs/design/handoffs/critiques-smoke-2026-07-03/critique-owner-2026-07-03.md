# Design Critique — Owner role (dueño)

**Product:** MiMAR (Mi Mascota Argentina) · internal codename DIM
**Account:** `owner@dim.test` (Lucía Tester · personal · 21 mascotas)
**Viewport:** Desktop, 1278×944
**Date:** 2026-07-03
**Stage:** Working app / pre-launch polish

---

## Surfaces walked

1. Public landing (`/`) + login (`/login`)
2. Home dashboard (`/inicio`)
3. Pet roster (`/mis-mascotas`)
4. Pet libreta — credential + compliance + open cases (`/mis-mascotas/DIM-9HAK-D5Z4`)
5. Libreta timeline view (`?tab=libreta`)
6. My reports (`/denuncias/mias`)
7. Account & privacy (`/cuenta`)
8. Public credential — the QR-scan view (`/p/DIM-9HAK-D5Z4`)
9. Notifications inbox (`/notificaciones`)

---

## Overall impression

This reads like a real government-grade credential product, not a class project. The visual language — the blue guilloché/ticket borders, the "LIBRETA SANITARIA NACIONAL" banner, legal citations (Ord. CABA 41.831, Ley 22.953, Ley 25.326), the "República Argentina" footer stamp — consistently sells "official national registry," which is exactly the trust posture a pet-credential system needs. The single biggest opportunity is **status-truth consistency**: the same pet shows an "AL DÍA" badge while its compliance panel reads "0 DE 3 AL DÍA." In a health-compliance product, contradictory status is the one thing that erodes trust fastest.

---

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| Pet header badge says **AL DÍA** while the compliance card on the same screen says **0 DE 3 AL DÍA** (rabies "sin registro", esterilización "sin registro", microchip "sin verificar"). | 🔴 Critical | Make the header badge a function of compliance state. If 0/3 obligations are met, the badge should not read "al día." Define one source of truth for "al día" and reuse it everywhere (roster, header, sidebar). |
| Client-side navigation **retains scroll position** — several pages (`/p`, `/cuenta`, notifications) opened scrolled to the bottom instead of the top. | 🟡 Moderate | Reset scroll to top on route change (scroll restoration). Users landing mid-page on a credential looks broken. |
| Pet page action row is **icon-only** (edit, share, mark-lost, chapita, más). Screen-reader labels are present (good), but sighted users can't tell "chapita" from "mark as lost" at a glance — and mark-as-lost is a high-stakes action sitting next to low-stakes ones. | 🟡 Moderate | Add visible text labels (or at least tooltips). Visually separate the destructive/high-consequence "Marcar como perdida" from routine actions. |
| Notification cards expose **two buttons that go to the same pet** ("Ver mascota" + "Ver Michi"). | 🟢 Minor | Collapse to one primary action; the duplication adds noise to an already busy card. |
| Breadcrumb on `/denuncias/mias` reads **"← MIS MASCOTAS"** — wrong parent for a reports page. | 🟢 Minor | Point back to `/inicio` or `/denuncias`. |
| The `/inicio` "Estado sanitario" sidebar repeats **"Sin microchip registrado — registralo cuando lo tengas"** for many pets, making a long, repetitive scroll. | 🟢 Minor | Group identical pending items ("8 mascotas sin microchip") with a single expandable row, or summarize counts. |

## Visual hierarchy

- **What draws the eye first (dashboard):** the "Asentar un hecho en la libreta" natural-language logger with the pet-avatar strip — correct, this is the primary daily action and it's beautifully foregrounded.
- **What draws the eye first (pet page):** the oversized monogram avatar and the credential banner — correct for a credential, but the **compliance panel is the more important information** and sits below the fold. Consider surfacing a compact compliance summary inside or directly under the banner.
- **Reading flow:** clean top-to-bottom on list pages. The two-column dashboard (roster left, sanitary status right) works at desktop width.
- **Emphasis:** severity color (green AL DÍA / red PERDIDO / amber POR VENCER) is used consistently and reads instantly — a real strength.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Status badges | "AL DÍA" appears at pet-header level and card level but is computed differently than the compliance panel. | Single shared badge component driven by one compliance selector. |
| Vertical rhythm | Recurring large empty gaps below content / at page bottoms (`/cuenta`, pet credential tab). May be min-height + short content, or a render artifact — but it reads as "unfinished page." | Audit page shells for a min-height container that outgrows content; let the footer anchor the bottom. |
| Empty avatars | Roster shows "FOTO" placeholder tiles and many identical "F" monograms (seed data). | Not a design bug per se, but distinct monogram colors + a friendlier no-photo state would improve scannability once real photos exist. |

## Accessibility

- **Color contrast:** dark-navy header on cream, and dark text on white cards, all read comfortably. Muted grey helper text (e.g. "Cada una con su libreta sanitaria nacional", timestamps) is light — verify it clears 4.5:1 on the cream background.
- **Icon buttons:** correctly exposed with accessible names (`Anotar`, `Compartir`, `Marcar como perdida`, `Chapita`, `Más`) — good. Visible labels still recommended (see Usability).
- **Touch targets:** desktop-adequate; re-check the small notification "Archivar" text link and the sort toggle at mobile widths.
- **Status not by color alone:** badges pair color with text ("AL DÍA", "PERDIDO") — good, not color-only.

## What works well

- **Natural-language libreta logging** ("Firulais — ¿qué pasó?") with quick chips (Vacuna, Peso, Vet, Medicación, Nota) is a genuinely novel, low-friction primary action.
- **Privacy-by-design**: the `/cuenta` toggles (show name / phone on public credential, allow shelter contact, zone lost-pet alerts) are granular, plain-language, and explicitly tied to Ley 25.326. The Tier-0 public credential exposes identity only — no owner PII.
- **Provenance**: "REGISTRADO POR VOS" stamps on timeline events, and "Credencial verificada por MiMAR" on the public page, build trust in the record.
- **Contextual health safety**: the amber "Observación antirrábica en curso" block spells out the 10-day rule and warning signs right where the owner will see it.
- **Notifications** are typed and severity-accented (LISTO / URGENTE / ATENCIÓN) with clear per-item actions.

## Priority recommendations

1. **Fix status-truth consistency (AL DÍA vs 0 DE 3).** One compliance selector feeding every badge. This is the highest-trust, highest-visibility fix.
2. **Reset scroll on navigation** so credentials and account pages open at the top, and audit the trailing-whitespace / page-shell height issue.
3. **Label and de-risk the pet action row** — visible labels + separate the destructive "Marcar como perdida" from routine actions.

## Notes / to verify

- Dev-server pages were **slow to paint** (repeated screenshot timeouts). Likely dev-mode + heavy pages (map, many DOM nodes); worth a production Lighthouse pass before drawing conclusions.
- Seed/test data (`E2EPet-1782994656202`, duplicated "Firulais" names) is cosmetic only and out of scope for design.
