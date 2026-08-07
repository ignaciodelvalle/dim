# QA Cowork — Ronda nocturna COMPLETA (flujos mutantes, 5 personas)

**URL:** https://dim-staging-a3ynpgcos-ignacio-dim.vercel.app
**Cuentas:** owner@ / owner2@ / govt@ / admin@ / orgadmin@ / vet@ / lilian@ — todas `Test1234!`
**Tu lane:** TODOS los flujos con login y mutación. Cursor corre en paralelo un pack SOLO-LECTURA (anon + visual) — no se pisan.
**Contexto:** los 4 blockers de tu pasada anterior están ARREGLADOS y verificados headless; tu trabajo hoy es re-confirmarlos click-through + validar la ola de fixes nueva. Cold start ~10s conocido. Reportá por circuito: RESUELTO/SIGUE/NUEVO + severidad.

## A. Re-confirmaciones (eran blockers, ya verificados headless — confirmá click-through)
1. **Signup e2e**: cuenta nueva (gmail+alias) → wizard completo → cae logueado como owner. Sin loop.
2. **Transferencia P2P**: owner@ crea transferencia de un pet a owner2@ → owner2 acepta desde la notificación → el pet aparece en su cuenta. Sin error de schema.
3. **Seam denuncia→Estado**: denuncia anónima nueva (dirección real CABA, ej. barrio Almagro) → código → como govt@ verla en /gob/maltrato (barrios CABA ahora visibles para el operador de ciudad entera).
4. **Cache/privacidad en la URL exacta**: generá share de libreta → abrí la URL en incógnito → revocá → LA MISMA URL debe negar al toque. Ídem perdida→encontrada en /p/(token): el teléfono desaparece.
5. **Adopción 100% digital**: orgadmin publica → owner2 postula → aprobar → **finalizar seleccionando la postulación** (nuevo: el botón vive también en la ficha) → el pet aparece en la cuenta de owner2 + notificación.

## B. La ola de fixes nueva (P1/P2 — primera validación humana)
6. **Sello vet coherente**: lilian@ firma antirrábica a Rocco (DIM-DEMO-0001) vía Atender → owner@ ve el asiento con badge VERIFICADO y "Aplicó: Vet. M.N. …" (nunca más "Declarado por el titular" en un asiento firmado).
7. **Org escribe eventos**: orgadmin@ en la ficha de un pet en custodia → registrar peso/nota/vacuna (superficie nueva).
8. **Contadores honestos**: creá un pet nuevo → debe decir "Sin vacunas registradas" (NO "3 por vencer"); el share y el owner deben mostrar el MISMO conteo.
9. **Timestamps legales**: cerrá un caso de maltrato → Exportar MPF → el PDF debe decir hora ARGENTINA correcta con "(hora de Argentina)", formato 24h.
10. **Branding + género**: cuenta nueva → notificación dice "Te damos la bienvenida a MiMAR" (nunca DIM); en /p de un macho perdido el CTA dice "Lo/Está conmigo" (no "La").
11. **Revoke UX**: revocar un share ahora pide confirmación y limpia la caja del link muerto.
12. **Foster picker**: en tránsitos, el vet ya NO aparece como candidato.

## C. Features nuevas (primera validación humana)
13. **KPIs con decimales es-AR**: /gob y panorama — cobertura tipo "41,3%" (coma, 1 decimal), conteos enteros con punto de miles.
14. **Panorama degradado honesto**: si los KPIs tardan, la página DICE "No pudimos cargar los indicadores… Reintentá" — nunca skeletons eternos. Cargá /admin/panorama 3 veces seguidas: mapa siempre ≤30s.
15. **/funcionalidades**: la página nueva — 3 niveles con badges (Nacional / Según tu localidad / Según organizaciones), footer la linkea.

## D. Circuito operador completo (el del demo)
16. govt@ end-to-end: Panel → panorama (mapa con divisiones) → maltrato → tomar denuncia → asignar → cerrar → MPF PDF. ¿Se cierra el día sin adivinar?

Veredicto final: ¿la demo con funcionarios sale impecable? ¿Qué la mancharía?
