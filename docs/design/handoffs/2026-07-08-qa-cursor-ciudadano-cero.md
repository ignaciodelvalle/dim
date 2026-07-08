# QA Cursor — "EL CIUDADANO CERO" — construir una vida entera desde la nada

**URL:** https://dim-staging-f2a4yqxpz-ignacio-dim.vercel.app
**Filosofía:** las corridas anteriores usaron cuentas seed (data pre-cargada). Esta NO. Vos sos un vecino real que llega a MiMAR **sin nada** y construye TODO a mano — como el primer usuario de un distrito el día del lanzamiento. Probás la **creación** y la **robustez con volumen**, no la lectura de seeds.
**Sin colisión con Cowork:** Cowork usa cuentas seed en OTRA URL; vos creás cuentas NUEVAS acá. No se pisan.
**Ritmo:** sos lento y meticuloso — mejor. Tomate el tiempo. Si algo tarda, esperá antes de marcar FALLA.
**Reporte:** OK / FALLA + severidad + captura. Lo que buscamos: ¿el sistema aguanta a un usuario real construyendo data de cero, con volumen?

---

## ACTO 1 — Nacer en el sistema
1. **Signup real** con un email tuyo + alias (gmail+algo). Completá el wizard. ¿Caés logueado como owner? ¿El onboarding se entiende sin ayuda?
2. **Perfil**: completá tu perfil en /cuenta (nombre, datos). ¿Persiste?

## ACTO 2 — Poblar (VOLUMEN — creá MUCHO)
3. **Registrá 5 mascotas distintas** (variá: perro/gato, con foto y sin, con chip y sin). ¿La lista /mis-mascotas las muestra todas bien? ¿Paginación o scroll con 5+?
4. **En UNA mascota, cargá una historia clínica DENSA a mano** (mínimo 10 eventos): varias vacunas, desparasitaciones, peso en el tiempo (4-5 pesadas), una medicación, una visita al vet, una nota. → ¿El timeline aguanta 10+ eventos? ¿La libreta los agrupa bien? ¿Los "vencimientos próximos" en /inicio se calculan de TU data real?
5. **Captura rápida** (/anotar en una mascota): cargá 2-3 eventos escribiendo texto libre — ¿el matcher local los interpreta?
6. **Corregí** uno de esos eventos ("Corregir registro") → ¿queda el "Ver original" (append-only)?

## ACTO 3 — Ejercer todas las acciones del dueño
7. **Compartí la libreta densa** → abrila en incógnito → ¿se ve toda la historia que cargaste? → revocá → ¿muere?
8. **Perdé una mascota** → disclosure (probá distintas combinaciones: solo teléfono / con ubicación) → mirá tu /p público → cargá un avistaje desde ahí → marcá encontrada.
9. **Transferí una mascota** a una segunda cuenta NUEVA que crees (owner-B) → aceptala → ¿aparece en owner-B?
10. **Viaje**: /mis-mascotas/[token]/viaje → recorré los corredores → generá el PDF.
11. **Turnos**: /turnos/buscar → ¿hay algo reservable? Reservá si podés.

## ACTO 4 — El ciudadano frente al Estado (sin cuenta / anon)
12. **Cargá 3 denuncias anónimas distintas** (variá las 9 clases y 4 severidades, con y sin adjuntos) → guardá los 3 códigos DEN-XXXX → trackealos por código (/denuncias/codigo/[code]). ¿Los 3 se crean y se rastrean?
13. Desde /p de una mascota ajena (DIM-DEMO-0001): ¿el form "encontré esta mascota" funciona sin cuenta?

## ACTO 5 — Convertirse en profesional (el flujo que NADIE probó)
14. **Upgrade a veterinario**: con una de tus cuentas, /cuenta/upgrade → cargá una matrícula + evidencia → (esto queda pendiente de aprobación de un govt; anotá hasta dónde llegás y si te frena por dni_verified). Documentá el estado del flujo.
15. **Crear consultorio**: /cuenta/crear-consultorio → ¿podés crear una clínica y aterrizar en su /org?

## ACTO 6 — Estrés y volumen
16. **Con tus 5 mascotas + 10 eventos + 3 denuncias creados**: recorré de nuevo /inicio, /mis-mascotas, la libreta densa, /denuncias/mias. ¿Todo carga con TU volumen sin lentitud extrema ni pantallas rotas? ¿Los contadores/nudges reflejan lo que cargaste?
17. **Doble-submit adversarial**: en una acción (compartir, o crear mascota), hacé doble click rápido → ¿se duplica el dato?
18. **Sesión larga**: después de 30-40 min creando cosas, ¿la sesión sigue viva? ¿Logout limpio?

## ACTO 7 — Móvil (390×844) con TU data
19. Repetí /inicio, la lista de 5 mascotas, la libreta densa y una denuncia nueva en viewport mobile. ¿El volumen que creaste se ve bien en el teléfono? ¿Sin scroll horizontal?

---

## Veredicto
La pregunta madre: **¿el sistema aguanta a un usuario real que construye su vida entera desde cero, con volumen?** ¿Qué se rompe cuando la data no es seed sino cargada a mano? Lo del Acto 5 (upgrade vet) es territorio virgen — vale doble.
