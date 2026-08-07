# QA Cowork — CORRIDA HISTÓRICA — todo el sistema, sin excepción

**URL:** https://dim-staging-f2a4yqxpz-ignacio-dim.vercel.app
**Cuentas (todas `Test1234!`):** owner@ · owner2@ · govt@ (CABA ciudad-entera) · govt-local@ (una localidad) · admin@ · orgadmin@ (Refugio Test) · alejo@ (admin de 4 orgs) · lilian@ (vet, Clínica Recoleta) · vet@ (vet indiv.) · noeli@/graciela@ (foster) · ignacio@/lucas@ (owner/govt extra)
**Método:** click-through real, 5+ personas, sin atajos de API. Tenés toda la noche — profundidad sobre velocidad.
**Reporte por ítem:** OK / PARCIAL / FALLA / N-A + severidad + evidencia. Los flujos NUNCA probados (bloque F) son la prioridad — nadie los corrió jamás.

> **Contexto de datos:** dos cosas pueden estar tibias en este build y NO son fallas: (a) las capas de EVENTOS del panorama (perdidas/avistajes/zoonosis) hasta el próximo re-seed; (b) si un detalle de caso da 404 para govt@ en una localidad-barrio, avisá el token exacto (hay un barrido de scope en curso). Todo lo demás es juego limpio.

---

## BLOQUE A — Ciclo de vida COMPLETO (la historia entera de una mascota, de punta a punta)
Esto nadie lo vivió como UNA sola narrativa. Hacelo con un pet NUEVO tuyo, en orden, sin saltear:
1. **Nace en el registro**: owner@ da de alta un pet nuevo (con foto). Credencial + QR aparecen.
2. **Salud en el tiempo**: registrá peso, una vacuna declarada, y una corrección de un evento (append-only: "Corregir registro" con "Ver original").
3. **Al veterinario**: como lilian@, resolvé ese pet por token en Atender y firmá una antirrábica → volvé como owner@, la libreta lo muestra VERIFICADO con matrícula.
4. **Se pierde**: marcá perdido con disclosure (solo teléfono) → escaneá el QR con el teléfono como un vecino → cargá un AVISTAJE desde el /p → marcá encontrado.
5. **Cambia de familia**: transferí a owner2@ → owner2 acepta → aparece en su cuenta.
6. **Viaja**: como owner2@, /mis-mascotas/[token]/viaje → semáforo de requisitos + export PDF del corredor.
7. **Comparte y revoca**: generá share de libreta → abrilo incógnito → revocá → confirmá que muere.
8. **Fin de vida**: registrá el evento de fallecimiento/disposición si existe la superficie.
→ ¿La historia fluye sin adivinar? ¿Algún eslabón se rompe?

## BLOQUE B — Owner-facing (PWA), TODA la superficie
- /inicio: saludo, captura rápida, mascotas, **vencimientos próximos**, turnos, casos, card "Estado sanitario" (nudges: vacuna vencida, sin microchip, próximo recordatorio, scans de credencial, esterilización).
- /mis-mascotas: lista; pet profile + timeline; **event detail con mapa OSM** cuando hay coords.
- Libreta: vista agrupada + cronológica + **imprimir**.
- **Captura rápida** (/anotar): el matcher local sin LLM — probá cargar un evento por texto.
- **Vecino-en-tránsito**: /mis-mascotas/nueva?custodyKind=transito (un vecino con un stray).
- **Turnos**: /turnos/buscar → reservar en una campaña/clínica → ver la agenda propia.
- /cuenta: perfil, edición, logout, memberships.

## BLOQUE C — Organizaciones (refugio/clínica/red/autoridad), TODO el portal
Con orgadmin@ (Refugio Test) y alejo@ (sus 4 orgs — probá el switch entre las 4, que no se mezclen datos):
- **Intake** con cross-check de microchip contra perdidas.
- **Custodia org→org**: proponer → aceptar → cancelar (two-phase).
- **Adopción completa**: publicar → (owner2 postula) → aprobar/rechazar/pedir info → **finalizar desde la postulación** → check-ins post-adopción → probá una **reversión/retiro** de adopción si la superficie existe.
- **Foster**: asignar tránsito (a un miembro foster: noeli@/graciela@) → cerrar tránsito.
- **Servicios + scheduling**: crear una oferta de servicio → materialización de slots.
- **Zonas de cobertura**: para el broadcast de perdidas.
- **Miembros + capability grants**: agregar/gestionar un miembro.
- **Bulk (refugio grande)**: multi-select → vacunación masiva / elegibilidad-adopción / publicar-despublicar.
- Pets **no aptas** para adopción (con razón estructurada).

## BLOQUE D — Welfare / Denuncias (Ley 14.346), circuito completo
- Denuncia pública anónima: las **9 clases** y **4 severidades**, con adjuntos → código DEN-XXXX.
- Tracking anónimo por código (/denuncias/codigo/[code]).
- Denuncia autenticada: /denuncias/mias + detalle.
- **Bridge a pet_events** cuando el sujeto es un pet registrado (maltrato/abandono/síntoma).
- Cola welfare-officer (govt@): urgent/mine, asignar, **abrir el detalle** (el fix de esta noche — probá con una denuncia ciudadana NUEVA), triage, derivar, cerrar, **export MPF a fiscalía**.
- Cola de moderación (admin@) para denuncias auto-flaggeadas.

## BLOQUE E — Admin & Govt, TODOS los dashboards y consolas
- /gob: mortalidad, vigilancia, analytics, población, **censo**, programa — cada dashboard, proyecciones sobre el event log.
- **Panorama**: los 5 presets (arrancá en **Bienestar** que dibuja; anotá si el default "% cumplimiento" cae vacío), capas, divisiones por zoom, k-anonimato, exportar PNG, reproducir en el tiempo.
- **Consola de reglas** (/admin/reglas): los 8 tipos de reglas, cascade localidad>provincia>país>default — creá/editá una regla y verificá que impacta.
- **Omnibox**: buscá personas y códigos de caso (NO mascotas — es por diseño).
- /admin/usuarios: lista, detalle con audit log, protección anti-autodesactivación.
- **Scope**: con **govt-local@** (una localidad) verificá que ve SOLO lo suyo; con govt@ (ciudad entera) que ve todos los barrios. Intentá URLs de otra jurisdicción → debe negar.

## BLOQUE F — LOS FLUJOS QUE NADIE PROBÓ JAMÁS (máxima prioridad)
1. **Upgrade a veterinario**: como un owner nuevo, /cuenta/upgrade → cargá matrícula + evidencia → como govt@ de esa localidad, aprobalo → el owner ahora es vet y puede firmar. (Requiere dni_verified — anotá si te frena ahí.)
2. **Vet independiente crea consultorio**: /cuenta/crear-consultorio → opera desde /org/[token].
3. **Verificación de organización**: registrá una org nueva → como govt@/admin@ verificala → pasa a activa/verificada.
4. **Observación antirrábica (EL flujo sanitario estrella)**: una mordedura → se abre el período de 10 días → /admin/observaciones/[token] → seguimiento → cierre (auto o manual) + escalación.
5. **PPP — perro potencialmente peligroso** (Ley CABA 4078): el flujo de raza peligrosa / atestación, si tiene superficie.
6. **Derechos del titular (Ley 25.326)**: exportá tus datos y probá el borrado de cuenta — que realmente purgue PII.
7. **Movilidad jurisdiccional**: los 5 corredores de viaje, el semáforo, el PDF.
8. **Notificaciones/recordatorios**: recorré la campana — vencimientos, nudges, transferencias — sin duplicados ni fantasmas.

## BLOQUE G — Anónimo / ciudadano (incógnito, sin cuenta)
- Landing completa (hero credencial viva, /funcionalidades, /leyes sin jerga).
- /p/[token]: Tier 0 sin PII; el badge de riesgo antirrábico (fix de esta noche).
- /perdidas, /adoptar: boards públicos, concordancia de género en los cards.
- **Signup nuevo end-to-end** → cae como owner (nunca admin/govt).

## BLOQUE H — Adversarial / transversal (si te queda energía)
- **Login en frío**: tipeá rápido apenas carga — ¿se come el texto? (bug de hidratación conocido, confirmá si sigue).
- **Concurrencia**: dos pestañas tocando el mismo recurso.
- **Cache en URL exacta**: revocá un share, abrí la MISMA url sin cache-bust en una pestaña NUEVA (no la que ya visitaste) → un scan real es carga fresca.
- **Cross-tenant**: como orgadmin@ de Refugio Test, intentá ver data de otra org por URL cruzada.
- **PII en superficies públicas**: ¿algún /p o board filtra teléfono/DNI/dirección sin consentimiento?
- **Timestamps**: hora argentina en TODO (PDF MPF, vencimientos de transferencia, libreta compartida).

---

## Veredicto final
Por bloque: ¿COMPLETO / CON RESERVAS / ROTO? Y la pregunta madre: **¿este sistema está listo para operar un distrito real, no solo para una demo?** Lo que encuentres en el Bloque F vale doble — es territorio virgen.
