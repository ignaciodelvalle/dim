# Génesis ledger — 2026-07-07 (mundo vacío, solo admin@dim.test)

Formato: [acto N] <quién> creó <entidad>: <slug/token> (contexto) — AWAITING <rol> para el próximo acto

--- run mr9z8e6a ---
[act 1] admin@ created GOVT: govt-gen-mr9z8e6a@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] FAILED: TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('input[name="passwordConfirm"]')

[act 4] FAILED: TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('input[name="passwordConfirm"]')

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mr9zalkh ---
[act 1] admin@ created GOVT: govt-gen-mr9zalkh@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] FAILED: TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
Call log:
  - waiting for getByLabel(/^nombre$/i).first() to be visible

[act 4] FAILED: TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
Call log:
  - waiting for getByLabel(/^nombre$/i).first() to be visible

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mr9zc7a5 ---
[act 1] admin@ created GOVT: govt-gen-mr9zc7a5@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] FAILED: TimeoutError: locator.waitFor: Timeout 25000ms exceeded.
Call log:
  - waiting for locator('input[name="firstName"]') to be visible

[act 4] FAILED: TimeoutError: locator.waitFor: Timeout 25000ms exceeded.
Call log:
  - waiting for locator('input[name="firstName"]') to be visible

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mr9ziehy ---
[act 1] admin@ created GOVT: govt-gen-mr9ziehy@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] FAILED: Error: Form error: 
[act 4] FAILED: Error: Form error: 
[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mr9zjbz1 ---
[act 1] admin@ created GOVT: govt-gen-mr9zjbz1@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] FAILED: TimeoutError: locator.evaluate: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /continuar/i })

[act 4] FAILED: TimeoutError: locator.evaluate: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /continuar/i })

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mr9zmvte ---
[act 1] admin@ created GOVT: govt-gen-mr9zmvte@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] FAILED: TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for getByText(/contanos quién sos|paso 2 de 2/i) to be visible

[act 4] FAILED: TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for getByText(/contanos quién sos|paso 2 de 2/i) to be visible

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mr9zow2o ---
[act 1] admin@ created GOVT: govt-gen-mr9zow2o@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] FAILED: TimeoutError: locator.evaluate: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /^continuar$/i })

[act 4] FAILED: TimeoutError: locator.evaluate: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /^continuar$/i })

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mr9zrt40 ---
[act 1] admin@ created GOVT: govt-gen-mr9zrt40@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] FAILED: TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for getByLabel(/^nombre$/i)

[act 4] FAILED: Error: locator.selectOption: Error: Element is not a <select> element
Call log:
  - waiting for getByLabel(/provincia de la matrícula/i)
    - locator resolved to <input value="" type="text" required="" aria-required="true" id="_R_1ajlfiv5uebtb_" name="matriculaJurisdiccion" aria-describedby="_R_1ajlfiv5uebtb_-hint" class="w-full min-h-[44px] rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-3 py-2.5 font-[var(--font-ln-sans)] text-base sm:text-[13.5px] text-[var(--color-ln-ink)] placeholder:text-[var(--color-ln-faint)] outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-cele…/>
  - attempting select option action
    - waiting for element to be visible and enabled

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mr9zu93k ---
[act 1] admin@ created GOVT: govt-gen-mr9zu93k@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] FAILED: TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
[act 4] FAILED: TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for getByLabel(/número de matrícula/i)

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra09b5e ---
[act 1] admin@ created GOVT: govt-gen-mra09b5e@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] FAILED: TimeoutError: page.waitForURL: Timeout 90000ms exceeded.
=========================== logs ===========================
waiting for navigation until "commit"
============================================================
[act 4] FAILED: Error: locator.waitFor: Error: strict mode violation: getByText(/dni declarado/i) resolved to 2 elements:
    1) <li class="flex items-center gap-2 text-[13px] text-[var(--color-ln-ink-2)]">…</li> aka getByText('DNI declarado').first()
    2) <li class="flex items-center gap-2 text-[13px] text-[var(--color-ln-ink-2)]">…</li> aka getByText('DNI declarado').nth(1)

Call log:
  - waiting for getByText(/dni declarado/i) to be visible

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra10vlr ---
[act 1] admin@ created GOVT: govt-gen-mra10vlr@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra10vlr@dim.test registered → pet DIM-QPAV-P256 (Chichila)
[act 3] FAILED: TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for getByLabel(/^cuit$/i)

[act 4] vet-gen-mra10vlr@dim.test requested matrícula — AWAITING APPROVE
[act 4] FAILED: TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('li button').filter({ hasText: 'Palermo' }).first()
    - locator resolved to <button type="button" class="block w-full text-left px-3 py-2 bg-ln-stripe ">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <html lang="es-AR" class="__variable_d241a6 __variable_f932ee __variable_c8daab __variable_fcc734 __variable_2d1901">…</html> intercepts pointer events
  - retrying click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - element is outside of the viewport
  - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="flex-1 px-4 pt-8 pb-32 max-w-md mx-auto w-full">…</div> intercepts pointer events
    - retrying click action
      - waiting 100ms
    14 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div class="flex-1 px-4 pt-8 pb-32 max-w-md mx-auto w-full">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - element is outside of the viewport
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div class="flex-1 px-4 pt-8 pb-32 max-w-md mx-auto w-full">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div class="flex-1 px-4 pt-8 pb-32 max-w-md mx-auto w-full">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms
    - waiting for element to be visible, enabled and stable

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra14929 ---
[act 1] FAILED: TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /crear cuenta de gobierno/i })
    - locator resolved to <button type="submit" class="inline-flex items-center justify-center gap-[7px] font-semibold rounded-[var(--radius-op-btn,6px)] border transition-colors cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-op-celeste-050)] px-3.5 py-2 text-[12.5px] bg-[var(--color-ln-op-azul)] text-white border-[var(--color-ln-op-azul)] hover:bg-[var(--color-ln-op-azul-700)] hover:border-[var(--color-ln-op-azul…>Crear cuenta de gobierno</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <p class="text-xs text-ln-mute ">Cachi, Salta</p> from <div class="space-y-4">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <p class="text-xs text-ln-mute ">Cachi, Salta</p> from <div class="space-y-4">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    57 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <p class="text-xs text-ln-mute ">Cachi, Salta</p> from <div class="space-y-4">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms

[act 2] citizen lucia-gen-mra14929@dim.test registered → pet DIM-5UMQ-YT83 (Chichila)
[act 3] FAILED: TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for getByLabel(/^cuit$/i)

[act 4] vet-gen-mra14929@dim.test requested matrícula — AWAITING APPROVE
[act 4] FAILED: TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================

--- run mra1hr0l ---
[act 1] admin@ created GOVT: govt-gen-mra1hr0l@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra1hr0l@dim.test registered → pet DIM-2SSW-EY24 (Chichila)
[act 3] FAILED: TimeoutError: locator.getAttribute: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('a[href^="/org/"]').first()

[act 4] vet-gen-mra1hr0l@dim.test requested matrícula — AWAITING APPROVE
[act 4] FAILED: TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('a[href^="/gob/cola/"]').first() to be visible

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra1kx8s ---
[act 1] admin@ created GOVT: govt-gen-mra1kx8s@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra1kx8s@dim.test registered → pet DIM-5EY4-TUSQ (Chichila)
[act 3] FAILED: TimeoutError: page.waitForURL: Timeout 90000ms exceeded.
=========================== logs ===========================
waiting for navigation until "commit"
============================================================
[act 4] FAILED: TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for getByText(/solicitud enviada/i) to be visible

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra1vt6o ---
[act 1] admin@ created GOVT: govt-gen-mra1vt6o@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra1vt6o@dim.test registered → pet DIM-3U2W-46RD (Chichila)
[act 3] FAILED: TimeoutError: page.waitForURL: Timeout 90000ms exceeded.
=========================== logs ===========================
waiting for navigation until "commit"
============================================================
[act 4] FAILED: TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for getByText(/solicitud enviada/i) to be visible

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra227zb ---
[act 1] FAILED: TimeoutError: locator.scrollIntoViewIfNeeded: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /crear cuenta de gobierno/i }).first()

[act 2] FAILED: TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('input[name="localityName"]')

[act 4] FAILED: TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('form').filter({ has: locator('[name="matriculaNumber"]') }).getByRole('button', { name: /enviar solicitud de verificación/i })


--- run mra24zve ---
[act 1] admin@ created GOVT: govt-gen-mra24zve@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra24zve@dim.test registered → pet DIM-G8AN-7ABS (Chichila)
[act 3] FAILED: TimeoutError: page.waitForURL: Timeout 45000ms exceeded.
=========================== logs ===========================
waiting for navigation until "commit"
============================================================
[act 4] FAILED: Error: Vet upgrade: No se pudo guardar la solicitud: Failed query: update "profiles" set "matricula_number" = $1, "matricula_jurisdiccion" = $2, "updated_at" = $3 where "profiles"."id" = $4
params: MP-GEN-mra2,CABA,2026-07-07T02:59:31.249Z,a8df7b05-583c-4a3d-9ab5-2a2214cd35e5
[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra2a2aq ---
[act 1] admin@ created GOVT: govt-gen-mra2a2aq@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra2a2aq@dim.test registered → pet DIM-MYZM-EXAR (Chichila)

--- run mra2cvtq ---
[act 1] admin@ created GOVT: govt-gen-mra2cvtq@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra2cvtq@dim.test registered → pet DIM-RZZ9-AUAQ (Chichila)
[act 3] maria-gen-mra2a2aq@dim.test registered refugio → ORG DIM-VXU6-73RX — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-VXU6-73RX (cola APR-JN3W-434B) → refugio active
[act 4] FAILED: Error: Vet upgrade: No se pudo guardar la solicitud: Failed query: update "profiles" set "matricula_number" = $1, "matricula_jurisdiccion" = $2, "updated_at" = $3 where "profiles"."id" = $4
params: MP-GEN-mra2,CABA,2026-07-07T03:03:20.125Z,21389f47-a653-4efa-af7d-0261a4b6bc51
[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true
[act 3] maria-gen-mra2cvtq@dim.test registered refugio → ORG DIM-6WZ6-4RP5 — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-6WZ6-4RP5 (cola APR-7R8C-C93U) → refugio active
[act 4] FAILED: Error: Vet upgrade: No se pudo guardar la solicitud: Failed query: update "profiles" set "matricula_number" = $1, "matricula_jurisdiccion" = $2, "updated_at" = $3 where "profiles"."id" = $4
params: MP-GEN-mra2,CABA,2026-07-07T03:05:30.851Z,05a68a95-b896-49f5-b3a1-e8af13f850cd
[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra2iscq ---
[act 1] admin@ created GOVT: govt-gen-mra2iscq@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra2iscq@dim.test registered → pet DIM-Z5CS-QA9D (Chichila)
[act 3] maria-gen-mra2iscq@dim.test registered refugio → ORG DIM-SD69-WHWG — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-SD69-WHWG (cola APR-PXFP-GNPD) → refugio active
[act 4] vet-gen-mra2iscq@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-QW2S-RM6C
[act 5] FAILED: TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('section[aria-hidden="false"]').getByRole('button', { name: /^continuar$/i })
    - locator resolved to <button disabled type="button" class="inline-flex items-center justify-center gap-[7px] font-semibold rounded-[var(--radius-op-btn,6px)] border transition-colors cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-op-celeste-050)] px-3.5 py-2 text-[12.5px] bg-[var(--color-ln-op-azul)] text-white border-[var(--color-ln-op-azul)] hover:bg-[var(--color-ln-op-azul-700)] hover:border-[var(--color-l…>Continuar</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    57 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra2o7z6 ---
[act 1] admin@ created GOVT: govt-gen-mra2o7z6@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra2o7z6@dim.test registered → pet DIM-MGKS-R5YU (Chichila)
[act 3] maria-gen-mra2o7z6@dim.test registered refugio → ORG DIM-JUW8-B4NF — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-JUW8-B4NF (cola APR-HPJW-UN5J) → refugio active
[act 4] vet-gen-mra2o7z6@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-4F8K-S29E
[act 5] FAILED: TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /publicar adopción/i })

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra2utkj ---
[act 1] admin@ created GOVT: govt-gen-mra2utkj@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra2utkj@dim.test registered → pet DIM-N3FK-5986 (Chichila)
[act 3] maria-gen-mra2utkj@dim.test registered refugio → ORG DIM-RTPK-N8X5 — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-RTPK-N8X5 (cola APR-KMQX-6GYY) → refugio active
[act 4] vet-gen-mra2utkj@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-YQ5W-YGB7
[act 5] FAILED: TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /apta para adopción/i })

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra2zvrl ---
[act 1] admin@ created GOVT: govt-gen-mra2zvrl@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra2zvrl@dim.test registered → pet DIM-STRU-K6D3 (Chichila)
[act 3] maria-gen-mra2zvrl@dim.test registered refugio → ORG DIM-F22G-9HVB — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-F22G-9HVB (cola APR-D4ZG-27F9) → refugio active
[act 4] vet-gen-mra2zvrl@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-QUPH-W3GC
[act 5] FAILED: TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for getByText(/elegibilidad para adopción/i) to be visible

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra398gk ---
[act 1] admin@ created GOVT: govt-gen-mra398gk@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra398gk@dim.test registered → pet DIM-PY8F-YJYM (Chichila)
[act 3] maria-gen-mra398gk@dim.test registered refugio → ORG DIM-FYPJ-QJEY — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-FYPJ-QJEY (cola APR-4QM4-STHS) → refugio active
[act 4] vet-gen-mra398gk@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-3VTF-ZCXM
[act 5] FAILED: TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /postular/i })

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra3f3gi ---
[act 1] admin@ created GOVT: govt-gen-mra3f3gi@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra3f3gi@dim.test registered → pet DIM-ZXUV-MCVM (Chichila)
[act 3] maria-gen-mra3f3gi@dim.test registered refugio → ORG DIM-VPNB-ZJS9 — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-VPNB-ZJS9 (cola APR-3V5F-6ENE) → refugio active
[act 4] vet-gen-mra3f3gi@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-D9UR-44QR
[act 5] FAILED: Error: Adoption apply page unavailable: Ir al contenido principal
m
MiMAR
MI MASCOTA ARGENTINA
Inicio
Mis mascotas
Denuncias
1
AD
adop-gen-mra3f3gi
?
No encontramos esa credencial

El código puede estar mal tipeado, o la credencial pudo haber expirado o haber sido dada de baja. Revisá el enlace o el QR e intentá de nuevo.

Ver mascotas pe
[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra3k00f ---
[act 1] admin@ created GOVT: govt-gen-mra3k00f@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra3k00f@dim.test registered → pet DIM-BP6C-EAEV (Chichila)
[act 3] maria-gen-mra3k00f@dim.test registered refugio → ORG DIM-MWCB-ADT8 — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-MWCB-ADT8 (cola APR-VABS-CQBX) → refugio active
[act 4] vet-gen-mra3k00f@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-7J5B-F8F9
[act 5] FAILED: Error: Adoption apply page unavailable: Ir al contenido principal
m
MiMAR
MI MASCOTA ARGENTINA
Inicio
Mis mascotas
Denuncias
1
AD
adop-gen-mra3k00f
← VOLVER A LA FICHA
M

POSTULACIÓN DE ADOPCIÓN

Adoptar a Morena

Patitas Génesis

LO QUE VERÁ EL REFUGIO DE VOS

adop-gen-mra3k00f

adop-gen-mra3k00f@dim.test

Paso 1 de 5

Por qué querés ado
[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra3p75w ---
[act 1] admin@ created GOVT: govt-gen-mra3p75w@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra3p75w@dim.test registered → pet DIM-J9QC-DWMX (Chichila)
[act 3] maria-gen-mra3p75w@dim.test registered refugio → ORG DIM-Q59S-EYG6 — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-Q59S-EYG6 (cola APR-2YR8-9JTR) → refugio active
[act 4] vet-gen-mra3p75w@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-QT5U-U4VS
[act 5] FAILED: Error: locator.click: Error: strict mode violation: getByText(/casa con patio/i) resolved to 3 elements:
    1) <textarea rows="4" id="motivation" class="w-full rounded-[5px] border px-3 py-2.5 text-[13px] outline-none focus:ring-2" placeholder="Ej: "Siempre tuve perros y ahora que me mudé a una casa con patio quiero darle una familia a Morena..."">Quiero adoptar a Morena porque busco una compañer…</textarea> aka getByPlaceholder('Ej: "Siempre tuve perros y')
    2) <span>Casa con patio</span> aka getByText('Casa con patio', { exact: true })
    3) <dd class="m-0 line-clamp-2">Quiero adoptar a Morena porque busco una compañer…</dd> aka locator('dl').getByText('Quiero adoptar a Morena')

Call log:
  - waiting for getByText(/casa con patio/i)

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra3r31s ---
[act 1] admin@ created GOVT: govt-gen-mra3r31s@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra3r31s@dim.test registered → pet DIM-J2QQ-8JF6 (Chichila)
[act 3] maria-gen-mra3r31s@dim.test registered refugio → ORG DIM-BKJY-HBHC — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-BKJY-HBHC (cola APR-7Z6G-B9E4) → refugio active
[act 4] vet-gen-mra3r31s@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-YWCY-BCPD
[act 5] FAILED: TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /confirmar aprobación/i })

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra3xk8g ---
[act 1] admin@ created GOVT: govt-gen-mra3xk8g@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra3xk8g@dim.test registered → pet DIM-66GY-XXYB (Chichila)
[act 3] maria-gen-mra3xk8g@dim.test registered refugio → ORG DIM-XQCM-W95M — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-XQCM-W95M (cola APR-URNX-XJ7R) → refugio active
[act 4] vet-gen-mra3xk8g@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-924E-4NFG
[act 5] FAILED: TimeoutError: locator.waitFor: Timeout 25000ms exceeded.
Call log:
  - waiting for getByText(/dni declarado/i).first() to be visible

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra42ujq ---
[act 1] admin@ created GOVT: govt-gen-mra42ujq@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra42ujq@dim.test registered → pet DIM-S63W-7P5F (Chichila)
[act 3] maria-gen-mra42ujq@dim.test registered refugio → ORG DIM-QWC5-PBU9 — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-QWC5-PBU9 (cola APR-BPSH-7N9J) → refugio active
[act 4] vet-gen-mra42ujq@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-6UQ4-9KUG
[act 5] FAILED: TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for getByLabel(/^dni$/i)

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra492kc ---
[act 1] admin@ created GOVT: govt-gen-mra492kc@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra492kc@dim.test registered → pet DIM-XQ3A-WDVQ (Chichila)
[act 3] maria-gen-mra492kc@dim.test registered refugio → ORG DIM-XVCH-JSFY — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-XVCH-JSFY (cola APR-ZT4D-UFFE) → refugio active
[act 4] vet-gen-mra492kc@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-WQQ2-C57W
[act 5] FAILED: TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('input[name="petCode"]')

[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true

--- run mra4g2uz ---
[act 1] admin@ created GOVT: govt-gen-mra4g2uz@dim.test (jurisdiction CABA/Palermo) → ✓
[act 2] citizen lucia-gen-mra4g2uz@dim.test registered → pet DIM-5XDN-USNW (Chichila)
[act 3] maria-gen-mra4g2uz@dim.test registered refugio → ORG DIM-YTSB-AS89 — AWAITING VERIFY
[act 3✓] govt verified ORG DIM-YTSB-AS89 (cola APR-H8QQ-P2QR) → refugio active
[act 4] vet-gen-mra4g2uz@dim.test requested matrícula — AWAITING APPROVE
[act 4✓] govt approved vet → clinic ORG DIM-F3JP-P49H
[act 5] life events: vacuna DIM-5XDN-USNW, rescue DIM-ZRR6-U3J4, mordedura, lost/found
[act 6] govt filtered Palermo — KPIs visible; /gob/reglas readOnly=true
