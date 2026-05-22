# Landing redesign — implementation plan

**Date:** 2026-05-22
**Status:** Spec'd, awaiting implementation
**Owner:** Whoever picks up the ticket (likely Claude Code)
**Source session:** Cowork brainstorm + design critique + redesign mockup, 2026-05-22

## What this is

A staged plan to fix the post-build review findings on the new owner landing at `/`. The landing was just shipped (commit window 2026-05-22): unauthenticated visitors get a hero, three benefit cards, and a 3-field pet draft form that hands off to `/signup` via a `localStorage` draft. The review surfaced six concrete issues; this doc breaks them into three implementation phases plus open decisions.

Don't treat this as a Figma handoff — there is no Figma. This is a *redesign-from-critique* handoff. The visual target is described in §"Visual target" below; the precise widget mockup was rendered in the Cowork session that spec'd this.

## Files in scope

| File | Purpose | Touched in this plan? |
|------|---------|----------------------|
| `app/page.tsx` | Public landing | ✅ Phase 1 + 2 |
| `app/_components/PetDraftForm.tsx` | Draft form + localStorage utilities | ✅ Phase 1 |
| `app/(auth)/signup/SignupForm.tsx` | 2-step signup | ✅ Phase 1 + 2 |
| `app/(auth)/login/LoginForm.tsx` | Login form | ✅ Phase 3 (copy register only) |
| `components/PetForm.tsx` | Shared pet create/edit form | ✅ Phase 3 (refactor to absorb draft form) |
| `lib/form-classes.ts` | Shared Tailwind class strings for inputs | ✅ Phase 1 (padding bump) |

## Visual target (recap)

Sectioned vertically, every section is full-width inside `max-w-5xl px-6 py-12 md:py-20`:

1. **Hero** — H1 *"La credencial digital de tu mascota"*, subhead immediately delivers the strongest benefit (*"Si se pierde, cualquiera con un celular puede escanear su QR y avisarte al instante."*). Centered, no decoration.
2. **Conversion row** (two columns on `md:` and up, stacked on mobile):
   - **Left (`md:col-span-3`):** the form panel, white card, padding `p-6 md:p-8`, rounded-2xl, 0.5px border. Same fields as today — name, species, breed — plus CTA *"Crear cuenta gratis →"* and microcopy *"Te llevamos a registrarte. Tarda un minuto."*
   - **Right (`md:col-span-2`):** a static credential-preview card showing what the user is creating. Small, restrained, neutral palette. Dog/cat silhouette placeholder, *"Firulais — Perro · Labrador"* sample text, a static QR pattern (no real encoding), a sample `DIM-A47K-9P2X` token in mono. Header label: *"Así se va a ver"*.
3. **Benefits grid** (asymmetric, `md:grid-cols-5`):
   - **Lead card (`md:col-span-2`)** for *"Si se pierde"* — accented with `--color-gob-celeste` pill containing icon + label, larger heading, fuller body copy.
   - **Two supporting cards (`md:col-span-3` split 50/50)** for *Libreta digital* and *Vos decidís qué se ve* — smaller, no accent, single-line headings.
4. **Casos urgentes block** — full-width below the benefits, distinct visual register: `--color-gob-danger` at ~10% opacity for the background, accent icon (alert-triangle), label *"Casos urgentes — no necesitás cuenta"*, two underline links (denunciar maltrato / buscar denuncia) clearly framed as a public-service offering, not part of the conversion path.
5. **Auth-aware top band** (only when `user` is present) — replaces the current "Ir a mi portal" card. Thin strip above the hero: avatar dot + *"Hola {firstName} — ya tenés sesión iniciada"* + right-aligned *"Ir a mi portal →"*. Marketing content stays visible below.

## Design tokens (existing, no new ones needed)

The project already uses Poncho/gob.ar tokens in `app/globals.css`. Use these — don't invent new colors.

| Use case | Token | Hex |
|----------|-------|-----|
| Primary CTA bg | `--color-gob-primary` | `#242c4f` |
| Lead benefit accent | `--color-gob-celeste` | `#37bbed` |
| Links | `--color-gob-azul-link` | `#0072bb` |
| Casos urgentes accent | `--color-gob-danger` | `#c62828` |
| Surface | `--color-gob-surface` (light), default neutral-950 (dark) | `#ffffff` / `#0a0a0a` |

Tailwind has these registered (via `@theme` or the bridge in globals.css). When a token isn't directly available as a utility class, use `style={{ background: "var(--color-gob-celeste)" }}` or add an `@layer utilities` shim — don't hardcode hex.

## Iconography

`components/Icon.tsx` is currently a **stub** (the `icono-arg` webfont registry was never committed). Until the registry lands:

- **Don't** import `<Icon name="..." />` for the landing — it would render the icon name as visible text.
- **Do** use small inline SVGs (Heroicons-style, 20×20, `stroke-width="1.5"`) for the four icons the redesign needs: paw (brand mark), search (lead benefit), vaccine/syringe (supporting benefit), shield-check (supporting benefit), alert-triangle (casos urgentes).
- Inline SVGs go directly in JSX, no separate component. Decorative icons get `aria-hidden`.

Sample SVG pattern (use as template):

```tsx
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
  <path strokeLinecap="round" strokeLinejoin="round" d="…" />
</svg>
```

## Phase 1 — quick fixes (no architectural changes)

Land all six in one PR. Each is a contained edit.

### 1.1 Promote "Si se pierde" as lead benefit

**File:** `app/page.tsx`

Restructure the existing benefits `<section>` into an asymmetric `md:grid-cols-5` layout. The lead card spans 2 columns; the two supporting cards split the remaining 3. Replace the current `Benefit` helper with two helpers: `LeadBenefit` and `SupportingBenefit`. Keep them inline (this file owns its presentational components).

Lead card structure:

```tsx
<LeadBenefit
  label="Si se pierde"
  title="Cualquiera puede ayudarte a encontrarla"
  body="Su credencial pública tiene un QR. Quien lo escanee ve tu contacto y te avisa al instante — sin instalar nada."
/>
```

Lead label is a small pill: `<i>` placeholder removed; inline SVG (search icon) + label text. Background `bg-[var(--color-gob-celeste)]/10`, text `text-[color:var(--color-gob-azul-link)]`, `text-xs font-medium tracking-wide`.

Supporting cards keep the existing simpler structure but lose the emoji — replace with inline SVG.

### 1.2 Demote denuncias to a separate "Casos urgentes" block

**File:** `app/page.tsx`

The current `{/* Secondary actions */}` section is just two underline links. Replace with a card-like block placed *after* the benefits grid (not after the form). Structure:

```tsx
<section className="mt-12 rounded-2xl bg-[color:var(--color-gob-danger)]/10 p-4 md:p-5">
  <div className="flex gap-3 md:gap-4">
    <div className="shrink-0 mt-0.5"><AlertTriangleIcon /></div>
    <div className="flex-1 min-w-0">
      <p className="font-medium text-sm text-[color:var(--color-gob-danger-hover)] dark:text-red-300">
        Casos urgentes
      </p>
      <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
        No necesitás cuenta para denunciar maltrato animal o buscar el estado de una denuncia ya hecha.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/denuncias/nueva" className="text-sm underline underline-offset-4 text-[color:var(--color-gob-danger-hover)] dark:text-red-300">Denunciar maltrato →</Link>
        <Link href="/denuncias/buscar" className="text-sm underline underline-offset-4 text-[color:var(--color-gob-danger-hover)] dark:text-red-300">Buscar con código →</Link>
      </div>
    </div>
  </div>
</section>
```

Remove the existing `<section>` that contains the two underline links at the bottom of the page.

### 1.3 Add credential-preview card next to the form

**File:** `app/page.tsx`

Wrap the action panel `<section>` in a `md:grid md:grid-cols-5 md:gap-6` container. The form panel becomes `md:col-span-3`. Add a new `<CredentialPreviewCard />` at `md:col-span-2` (right side on desktop, below form on mobile).

The preview card is purely presentational — no state, no live data. It shows a static example credential:

- Small "Así se va a ver" label (uppercase, `text-[10px] tracking-[0.3em]`)
- Circular avatar placeholder (dog silhouette via inline SVG)
- *Firulais* heading, *Perro · Labrador* sub
- A static 7×7 SVG QR-pattern placeholder (decorative only, copy the pattern from the Cowork mockup widget)
- *DIM-A47K-9P2X* in `font-mono text-xs text-neutral-500`

Keep it inside a `<div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5">`. On mobile, render it *below* the form, not above, so the form (the conversion goal) is still the first interactive thing scrollable visitors hit.

### 1.4 Fix the step counter on signup for drafted users

**File:** `app/(auth)/signup/SignupForm.tsx`

Currently step labels say *"Paso 1 de 2"* and *"Paso 2 de 2"* regardless of whether the user came from the landing draft. When `petDraft` is non-null at mount, increase the count:

```tsx
// When user came from a landing draft they already did "step 1" (the
// pet info). Reflect that in the counter.
const totalSteps = hasDraftAtMount ? 3 : 2;
const accountStepNumber = hasDraftAtMount ? 2 : 1;
const petStepNumber = hasDraftAtMount ? 3 : 2;
```

`hasDraftAtMount` needs to be captured once, on mount, *before* the clear-on-step-pet effect runs. Stash it in a ref or in a sibling state so the counter doesn't change underneath the user when the draft is cleared.

Step 1 counter: `{accountStepNumber} de {totalSteps}`. Step 2 counter: `{petStepNumber} de {totalSteps}`. The `intent === "apply"` branch keeps its "Paso 1 de 1" hardcoded (no pet step at all for that flow).

### 1.5 Add 48-hour TTL to the localStorage draft

**File:** `app/_components/PetDraftForm.tsx`

`PetDraft` already has `savedAt: string` (ISO). Gate `readPetDraft()` to discard stale drafts:

```ts
const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export function readPetDraft(): PetDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PET_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PetDraft>;
    if (parsed?.v !== 1) return null;
    if (typeof parsed.name !== "string") return null;
    const savedAtIso = typeof parsed.savedAt === "string" ? parsed.savedAt : null;
    if (savedAtIso) {
      const age = Date.now() - new Date(savedAtIso).getTime();
      if (Number.isFinite(age) && age > STALE_AFTER_MS) {
        try { window.localStorage.removeItem(PET_DRAFT_KEY); } catch {}
        return null;
      }
    }
    return { v: 1, name: parsed.name, species: (parsed.species ?? "") as PetDraft["species"], breed: typeof parsed.breed === "string" ? parsed.breed : "", savedAt: savedAtIso ?? new Date().toISOString() };
  } catch {
    return null;
  }
}
```

### 1.6 Bump small-text contrast and form padding

**File:** `lib/form-classes.ts`

Change `inputClass` padding `px-3 py-2` → `px-3 py-2.5`. This brings the input height to ~44px, clearing the 44pt touch target.

**File:** `app/page.tsx` (and ripple through any similar spots)

Replace `text-neutral-500 dark:text-neutral-500` with `text-neutral-500 dark:text-neutral-400` on the small text instances (version stamp, secondary labels). Dark-mode contrast goes from ~4.0:1 to ~7.4:1, well above AA.

## Phase 2 — needs a decision before implementing

These two are not blockers — they're decisions you should make explicitly, then implement.

### 2.1 What does step 2 of signup do for drafted users?

**Two options, pick one before writing code.**

**Option A — auto-create, skip step 2.** When the signup-step-1 succeeds AND a draft is present, call `createPetAction` server-side with the draft's fields, then redirect to `/mis-mascotas`. The user goes account → done, no second form. Faster, more rewarding, riskier if the draft's validation fails post-account-creation (we'd need to fall back to step 2 with the draft pre-filled).

**Option B — step 2 becomes a read-only review.** Replace the pre-filled `PetForm` with a summary block — *"Firulais · Perro · Labrador — [editar]"* — plus the photo upload as the only interactive field. *"Guardar y entrar"* CTA submits the original draft + the new photo.

Implementation note: Option A requires routing `createPetAction` to accept draft fields server-side. The action today reads `FormData`; the cleanest path is to keep that and have the signup-step-1 client code submit a hidden form on draft success rather than introducing a new action variant.

Default recommendation: **Option A**. The credential is simple enough that auto-create is fine, and "I created my account and my pet was already there" is a strong moment. Implement A with B as the fallback when the draft's species is `""` or `"other"` (i.e. needs a sub-species pick).

### 2.2 Authenticated header band

**File:** `app/page.tsx`

Replace the current `{isAuthenticated ? <YaTenésCuentaCard /> : <PetDraftForm + signup />}` branching. Instead:

- When `user` is present, render a thin band *above* the hero (full-width, `bg-neutral-50 dark:bg-neutral-900`, `py-2 px-6`): avatar circle (initial) + *"Hola, {firstName} — ya tenés sesión iniciada"* + right-aligned `<Link href={portalPath}>Ir a mi portal →</Link>`.
- The marketing content (hero, form, benefits) stays visible below the band. The form *itself* still renders, but is replaced for authenticated users with a softer panel: "Querés sumar otra mascota? [Crear otra mascota →]" linking to `/mis-mascotas/nueva`. This keeps the visual rhythm of the page (form-shaped block in the same slot) for both audiences.

Decision needed: do you want auth users to see the form area at all, or just the marketing copy? My recommendation is "yes, see the form slot, but it's the soft 'add another pet' panel."

## Phase 3 — structural cleanup (later, separate PR)

### 3.1 Unify form copy register

**Files:** `app/(auth)/signup/SignupForm.tsx`, `app/(auth)/login/LoginForm.tsx`

The landing uses *vos*-warm copy (*"¿Cómo se llama tu mascota?"*, *"Empezá ahora"*). Signup uses neutral labels (*"Correo electrónico"*, *"Contraseña"*). Bring signup/login into the same register:

| Before | After |
|--------|-------|
| `Correo electrónico` | `Tu correo` |
| `Contraseña` | `Elegí una contraseña` (signup) / `Tu contraseña` (login) |
| `Nombre` (signup) | `¿Cómo te llamás?` |
| `Continuar` | `Guardar y continuar` |

### 3.2 Resolve the three-doors problem

**Files:** `components/PetForm.tsx`, `app/_components/PetDraftForm.tsx`, `app/page.tsx`, `app/(auth)/signup/SignupForm.tsx`

Today there are three different forms that create a pet: the landing draft, signup step 2 (compact `PetForm`), and `/mis-mascotas/nueva` (full `PetForm`). They'll drift. Pick one source of truth and configure it.

Proposal: extend `PetForm` with a `mode` prop:

- `mode="landing"` → renders only name + species + breed, persists to localStorage on every change, exposes `onContinue` that navigates to `/signup` after persisting. Replaces `PetDraftForm`.
- `mode="signup-step-2"` → compact (today's `compact` + `draftValues` behavior). Reads localStorage on mount, clears on submit.
- `mode="full"` → today's default (everything visible). Used by `/mis-mascotas/nueva`.

Once `PetForm` owns all three modes, `app/_components/PetDraftForm.tsx` is deleted; `app/page.tsx` imports `PetForm` directly with `mode="landing"`.

Risk: `PetForm` is already 900+ lines. Adding modes risks turning it into a mega-component. Mitigation: extract sub-sections (LoBasico, IdentificaciónYRaza, etc.) into separate small components in `components/pet-form/` first, then PetForm becomes a thin orchestrator that decides which sections to render per mode. This sub-extraction is good to do regardless of the three-doors issue.

## Acceptance criteria

Tick these off before merging Phase 1:

- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Unauthenticated visitor at `/` sees: hero, form (left) + credential preview (right) on `md:` and up; stacked on mobile.
- [ ] Form still drafts to `localStorage` on change and navigates to `/signup` on submit.
- [ ] On `/signup` after coming from a draft: step counter shows "Paso 2 de 3" then "Paso 3 de 3"; step 1 shows the *"Vamos a guardar la credencial de Firulais"* banner; step 2 has name/species/breed pre-filled.
- [ ] Manually setting `localStorage.setItem("mimar_pet_draft_v1", JSON.stringify({v:1, name:"X", species:"dog", breed:"", savedAt: new Date(Date.now() - 49*60*60*1000).toISOString()}))` and reloading `/signup` produces no banner (draft is stale).
- [ ] Benefits grid: lead card spans 2/5 of the row on `md:`, "Si se pierde" has the celeste pill label; two supporting cards split 3/5.
- [ ] Casos urgentes block has the danger-tinted background and sits *below* the benefits, *not* in the conversion path footer.
- [ ] Authenticated visitor at `/` sees the auth header band at the top + the marketing content below + a soft "sumar otra mascota" panel where the form was (assuming Phase 2.2 is in scope of the same PR).
- [ ] `lib/form-classes.ts` `inputClass` height ≥ 44px when measured in browser devtools.
- [ ] Dark-mode contrast: small-text on `dark:bg-neutral-950` passes WCAG AA (4.5:1 minimum, measured via Lighthouse / axe).

## Tests to add (optional but recommended)

- `app/_components/PetDraftForm.test.ts` — TTL behavior: fresh draft returns, 49h-old draft returns null and clears localStorage.
- `app/(auth)/signup/SignupForm.test.tsx` (component test, jsdom) — when localStorage has a draft, the step counter shows "Paso 2 de 3" on mount.

The existing test suite has no tests touching `app/page.tsx` or `SignupForm.tsx` directly, so there's no regression risk from the layout changes themselves.

## Out of scope (explicitly)

- PWA install prompt / `beforeinstallprompt` wiring. The user's original question included "then you download and just login" — the install side wasn't addressed in v1. A follow-up plan should add an "Instalar como app" CTA below the auth band or on the post-signup landing.
- Live (typing-driven) credential preview. The v1 preview is static. If/when this gets built, it should live in the existing right-column slot.
- The Mi Argentina disabled button on signup step 1. The user explicitly requested ignoring this finding from the critique.
- Vet, refugio, govt landings at `/vets`, `/refugios-info`, `/gob-info`. Owner is the only audience addressed here.

## References

- Critique source: Cowork session, 2026-05-22 (see `/design:design-critique` invocation).
- Redesign mockup source: Cowork session, 2026-05-22 (see `/design:design-system` invocation, widget `mimar_landing_redesign`).
- Existing design tokens: `app/globals.css` — `--color-gob-*` family.
- Icon situation: `components/Icon.tsx` — stub; inline SVGs only until the `icono-arg` registry lands.
- Original landing code shipped 2026-05-22 — see `app/page.tsx`, `app/_components/PetDraftForm.tsx`, `app/(auth)/signup/SignupForm.tsx`, `components/PetForm.tsx` (`draftValues` prop).
