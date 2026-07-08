# QA Cursor — PROFUNDIDAD (mientras Cowork corre) — lectura, PII, a11y, mobile

**URL:** https://dim-staging-el6eq8nyg-ignacio-dim.vercel.app (la misma de tu corrida anterior)
**Cuentas (todas `Test1234!`):** govt@ (CABA ciudad-entera) · owner@ · anon (sin login para lo público)
**Regla anti-colisión (importante):** Cowork está corriendo AHORA los flujos de MUTACIÓN pesada (denuncias, matrícula, org→org, ARCO, mordeduras) en esta misma URL. **NO toques nada que mute** — tu lane es LECTURA pura + adversarial de privacidad + accesibilidad + mobile.
**Y NO re-verifiques /gob/panorama** — sus 3 hallazgos (intermitencia, Actualizar, toggle) ya están arreglados en la branch, pendientes de deploy; verlos ahora mostraría el estado viejo. Enfocate en lo de abajo, que es todo NUEVO respecto de tu pack anterior.

---

## 1. Adversarial de PRIVACIDAD / PII (lo que un funcionario de datos personales mira primero)
El argumento más delicado ante un ministerio. Buscá LEAKS — read-only, sin crear nada:
- `/p/DIM-DEMO-0001` (Tier 0, anónimo): ¿aparece ALGÚN dato personal del dueño? (nombre, teléfono, DNI, dirección exacta). No debería, salvo lo que el dueño expuso en modo perdido.
- `/perdidas` y `/adoptar` (boards públicos): ¿alguna card filtra teléfono/DNI/dirección sin que sea consentido? La ubicación, ¿es aproximada (localidad) o exacta?
- `/leyes`: ¿aparece jerga interna del sistema? (nombres de tablas como `pet_events`, `export_subject_data`, tokens `DIM-`, o cualquier término técnico que un ciudadano no debería ver).
- Una **libreta compartida** (si encontrás un link de share activo de lectura): ¿muestra solo lo que corresponde al tier, sin PII de más?
- Probá **manipular una URL** de un recurso que no es tuyo (un token de pet ajeno en una ruta privada) → debe negar, no filtrar.

## 2. Dashboards /gob de LECTURA (govt@) — los que no recorriste
Andá por cada uno; ¿carga en tiempo razonable, en es-AR, con números coherentes (no NaN, no "undefined", no UTC)?
- `/gob` (panel): KPIs con decimales es-AR (coma, no punto).
- Mortalidad, Vigilancia, Analytics, Población, **Censo**, Programa (los tabs/secciones de /gob): ¿cada uno pinta? ¿los porcentajes y fechas en es-AR? ¿algún gráfico roto o vacío sin explicación honesta?
- La **bandeja de salida / outbox** (notificaciones a autoridades) si tiene superficie: ¿los SLA y timestamps en hora argentina?

## 3. Accesibilidad (WCAG) — read-only, teclado y contraste
- **Navegación por teclado**: en /login, /p, /perdidas, /adoptar → ¿podés tabular por todo con foco VISIBLE? ¿el orden de tabulación tiene sentido?
- **Landing**: con `prefers-reduced-motion` activado, ¿el hero credencial viva queda quieto (no cicla)?
- **Contraste**: ¿algún texto gris claro sobre fondo claro que cueste leer? (celeste sobre blanco, mute sobre card).
- ¿Los botones/CTAs tienen labels claros para lector de pantalla (no solo íconos)?

## 4. Mobile profundo (390×844) — más allá de lo público
Con owner@ logueado (crear cuenta no hace falta; usá owner@ que ya tiene data):
- `/inicio` (home del dueño): saludo, vencimientos, mascotas, nudges → ¿entra bien, sin scroll horizontal, CTAs con el pulgar?
- `/mis-mascotas` + una libreta densa: ¿el timeline y la libreta se leen bien en mobile?
- `/cuenta`: perfil, privacidad → ¿los botones alcanzables?
- La **campana de notificaciones** en mobile: ¿se abre y se lee bien?

## Reporte
Lista corta OK/FALLA por punto + captura. Los puntos 1 (PII) y 3 (a11y) son los que más valen para el pitch institucional — sé adversarial ahí. Recordá: solo lectura, no toques lo que Cowork está mutando.
