# Fix Work-Order — XSS-001 & HDR-001 (autonomous, for Claude Code)

> Source: `docs/audits/ai-audit-2026-07-01.md`. This is a **write** task (unlike the audit).
> **Do NOT load `docs/audit-agent-permissions.json`** for this — that profile is read-only and denies
> edits to `lib/` and `app/`. Run under normal CC permissions.
> Human-gated per `AGENTS.md`: you may create a branch, edit, run the gate, and commit **locally**.
> You may **not** push, open a PR, apply DB migrations, or deploy. No `Co-Authored-By` / AI attribution.
> Conventional commits. Spanish UI / English code.

## Scope (exactly this — nothing else)
- **New:** `lib/utils/json-ld.ts` (+ `lib/utils/json-ld.test.ts`)
- **Edit:** `app/(public)/adoptar/[petToken]/page.tsx` — use the helper, fix the biome-ignore rationale
- **Edit:** `app/(public)/refugios/[orgToken]/page.tsx` — use the helper, fix two misleading comments
- **Edit:** `next.config.ts` — add non-CSP security headers (HDR-001)
- **OUT OF SCOPE:** `app/(public)/denuncias/codigo/[code]/page.tsx` — its `dangerouslySetInnerHTML` is a
  **static print `<style>` with no user input**. Safe by construction. Do not touch. (Original audit
  over-flagged it; corrected here.)
- **OUT OF SCOPE:** all `qrSvg` injections — server-generated QR markup, not user free-text.

---

## Step 1 — Create `lib/utils/json-ld.ts`
Reason: `JSON.stringify` does not escape `<`, `>`, `&`, or U+2028/U+2029, so user free-text (pet name,
adoption story, org name/description) embedded in a `<script type="application/ld+json">` can break out →
stored XSS. HTML-entity escaping (`escape-html.ts`) is **wrong** here — the content is parsed as JSON, not
HTML — so emit JSON-safe unicode escapes.

```ts
// Serialize a JSON-LD object for safe embedding inside a
// <script type="application/ld+json"> tag.
//
// JSON.stringify alone is unsafe: user-controlled free-text (pet names, adoption
// stories, org names/descriptions) can contain "</script>" or the JS line
// separators U+2028/U+2029, breaking out of the inline script (stored XSS).
// HTML-entity escaping is wrong here — the payload is parsed as JSON, not HTML —
// so we emit JSON-safe \uXXXX escapes for the HTML-significant characters. The
// output still parses back to the original object (< is a valid JSON escape).
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
```

## Step 2 — Create `lib/utils/json-ld.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "./json-ld";

describe("serializeJsonLd", () => {
  it("neutralises a </script> breakout in user free-text", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script\\u003e");
  });

  it("escapes < > & and the U+2028/U+2029 line separators", () => {
    const out = serializeJsonLd({ a: "<", b: ">", c: "&", d: "\u2028", e: "\u2029" });
    expect(out).toContain("\\u003c");
    expect(out).toContain("\\u003e");
    expect(out).toContain("\\u0026");
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  it("round-trips to the original object", () => {
    const obj = { "@context": "https://schema.org", name: "Firulais & <friends>" };
    expect(JSON.parse(serializeJsonLd(obj))).toEqual(obj);
  });
});
```

## Step 3 — Edit `app/(public)/adoptar/[petToken]/page.tsx`
3a. Add the import (keep import ordering / Biome happy — it groups with the other `@/lib/...` imports):
```
import { serializeJsonLd } from "@/lib/utils/json-ld";
```
3b. Replace the injection block:
```diff
       <Script
         id="adoptar-jsonld"
         type="application/ld+json"
-        // biome-ignore lint/security/noDangerouslySetInnerHtml: SEO JSON-LD needs raw <script> content. The input is JSON.stringify of a controlled object, not user data.
-        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
+        // biome-ignore lint/security/noDangerouslySetInnerHtml: SEO JSON-LD needs raw <script> content; serializeJsonLd() neutralises <, >, & and U+2028/U+2029 so user-supplied pet fields (name, adoptionStory) cannot break out of the script.
+        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
       />
```

## Step 4 — Edit `app/(public)/refugios/[orgToken]/page.tsx`
4a. Add the import (groups with the other `@/lib/...` imports):
```
import { serializeJsonLd } from "@/lib/utils/json-ld";
```
4b. Fix the misleading comment above the `jsonLd` const (it currently claims Next escapes — it does not):
```diff
-  // JSON-LD Organization schema for rich-result eligibility on search
-  // engines + LinkedIn. Generated server-side and injected as a literal
-  // script tag — Next handles the dangerouslySetInnerHTML escape.
+  // JSON-LD Organization schema for rich-result eligibility on search
+  // engines + LinkedIn. Generated server-side and injected via serializeJsonLd()
+  // (Next/React do NOT escape dangerouslySetInnerHTML — the helper does).
```
4c. Replace the injection block:
```diff
           <script
             type="application/ld+json"
-            // biome-ignore lint/security/noDangerouslySetInnerHtml: safe-by-construction JSON
-            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
+            // biome-ignore lint/security/noDangerouslySetInnerHtml: serializeJsonLd() neutralises <, >, & and U+2028/U+2029 so user-supplied org fields (displayName, description, legalName) cannot break out of the script.
+            dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
           />
```

## Step 5 — Edit `next.config.ts` (HDR-001, non-CSP headers only)
Add an async `headers()` to `nextConfig`. **Deliberately no `Content-Security-Policy`** — a real CSP for
this app needs per-request nonces/hashes for the inline JSON-LD scripts and inline styles; shipping a naive
CSP would break rendering. CSP is a tracked follow-up (see §8). Keep this as its **own commit** so it can be
reverted independently of the XSS fix.
```diff
 const nextConfig: NextConfig = {
   reactStrictMode: true,
+  async headers() {
+    return [
+      {
+        source: "/:path*",
+        headers: [
+          { key: "X-Frame-Options", value: "DENY" },
+          { key: "X-Content-Type-Options", value: "nosniff" },
+          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
+          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
+          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
+        ],
+      },
+    ];
+  },
   images: {
```
> If `camera`/`geolocation` self-permissions conflict with a feature (QR scan, lost-pet map), adjust the
> `Permissions-Policy` value — do not remove the header.

---

## Step 6 — Verify (must pass before committing)
Run and capture output:
1. `pnpm typecheck`
2. `pnpm lint` (Biome — confirm import order + the two biome-ignore comments are still recognized)
3. `pnpm test -- json-ld` (new unit test green) — then `pnpm test` (no regressions)
4. `pnpm build` (confirms `headers()` config is valid and the pages still render)

If any step fails, fix within this scope or stop and report — do not expand scope.

## Step 7 — Commit (local only)
Two commits on a fix branch (e.g. `fix/jsonld-xss-and-security-headers`):
1. `fix(security): escape JSON-LD to prevent stored XSS on public pet/org pages`
   — includes `lib/utils/json-ld.ts`, its test, and the two page edits.
2. `chore(security): add baseline security response headers`
   — includes the `next.config.ts` edit.
**Do not push or open a PR** — hand the branch + HEAD SHA back to Ignacio for review.

## Step 8 — Report back / follow-ups
- Post the branch name + both commit SHAs + the verify/test/build output as evidence.
- Follow-up (not in this order): design a real **Content-Security-Policy** with nonces for inline JSON-LD
  and inline styles, tested against every public + app route (tracked from HDR-001).

---

## Acceptance criteria
- `rg -n 'JSON.stringify(jsonLd)' app` returns **nothing** (both sites now use `serializeJsonLd`).
- `lib/utils/json-ld.test.ts` passes; `pnpm test` and `pnpm build` green.
- Response headers present on a built response (spot-check `X-Frame-Options`, `X-Content-Type-Options`,
  `Strict-Transport-Security`).
- `denuncias/codigo/[code]/page.tsx` unchanged. No push/PR/migration performed.

## Rollback
Each concern is one commit — `git revert <sha>` undoes either independently. The new helper is additive
(safe to keep even if the page edits are reverted).
