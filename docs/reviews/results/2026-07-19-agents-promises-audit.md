# Auditoría de procesos DIM/MiMAR — polish / calidad / usabilidad / accesibilidad

> Deep review orquestada READ-ONLY (2026-07-19). 44 agentes: scout de AGENTS.md →
> 14 dominios auditados en 4 dimensiones → verificación adversarial → síntesis.
> Cada gap HIGH/CRÍTICO pasó por un escéptico. ✓ = CONFIRMED.

## 1. Resumen ejecutivo

La plataforma tiene una base sólida y coherente, pero la brecha entre lo que las promesas dicen y lo que un usuario real recibe se abre más en **Calidad** (features anunciadas que en producción no funcionan o mienten sobre su estado) que en cualquier otra dimensión. El caso más grave es **Cumplimiento y movilidad jurisdiccional**: el copiloto de viaje internacional (semáforo + checklist + PDF) está muerto de punta a punta —ningún formulario puede generar un corredor o un destino extranjero, la ruta `/viaje` no tiene ningún enlace que la alcance, y aun cuando se llega, el semáforo nunca puede llegar a verde. Le sigue **Foster/tránsito**, donde el pilar "vecino en tránsito" es inalcanzable desde la única alta que usa el ciudadano. En **Accesibilidad** hay un patrón único que se repite en 7 dominios: los wizards ocultan los pasos con `sr-only` + `aria-hidden`, dejando campos invisibles enfocables con teclado —una falla WCAG 4.1.2 sistémica. En **Calidad** hay además un patrón de deshonestidad de estados vacíos (KPIs que muestran rojo "0%" o verde "todo en orden" cuando no hay datos) en mortalidad, reunificación y viajes. **Pulido** es el más sano: mayormente acentos y voseo, salvo la libreta imprimible en inglés. Nada crítico quedó REFUTADO.

**Dimensión más débil: Calidad. Dominio más débil: Cumplimiento y movilidad** (feature completa que es fachada), empatado con Foster.

## 2. Por dimensión (gaps CONFIRMADOS)

### Calidad
| Sev | Dominio | Ubicación | Gap | Fix |
|---|---|---|---|---|
| CRÍTICO | Compliance | `actions.ts:491` + `MoveForm.tsx:57` | Viaje transfronterizo muerto: nada escribe `transport_recorded`; `to_country` hardcodeado "AR". Motor de corredores, PDF y semáforo inalcanzables | Formulario "Registrar viaje", o esconder `/viaje` tras flag |
| CRÍTICO | Foster | `nueva/page.tsx` + `MinimalNewPetForm` | "Vecino en tránsito" inalcanzable: el alta no tiene selector de custodia, toda mascota se registra como owner | Renderizar `CustodyKindToggle` en paso 1; normalizar `transito`→`foster_in_transit` |
| CRÍTICO→calidad | Libreta | `owner-nudges.ts:279` | Los "nudges" prometidos son código muerto: cero llamadores, anunciados vivos en 3 docs | Borrar la derivación huérfana + corregir docs (o remontar) |
| HIGH | Adopción | `postular/page.tsx:119` | Gate "ya postulaste" consulta eventos inexistentes → siempre "en revisión", bloquea re-postular a rechazados | Usar `adoption_application_resolved` |
| HIGH | Surveillance | `vigilancia/page.tsx:299` | Funcionario avisado de infracción legal de 10 días, pero el link cae en panel equivocado y la consola es admin-gated: no tiene superficie para cerrar la observación | Admitir govt en la ruta, o lista in-page |
| HIGH | Surveillance | `vigilancia/page.tsx:666` | Tarjeta "Observaciones rábicas en curso" muestra conteos de señales, no observaciones | Renombrar o poner la lista real |
| HIGH | Surveillance | `admin/observaciones/[token]/page.tsx:63` | Alarma roja "síntomas escalantes" sin límite temporal ni filtro de enfermedad → un resfrío viejo pinta rojo | Reflejar `findEscalatingSymptom` |
| HIGH | Perdidas | `devolucion/page.tsx:176` | Re-muestra propuestas rechazadas/canceladas como accionables; "Marcar recibida" tira error en loop | Usar `hasPendingProposal` |
| HIGH | Perdidas | `gob/perdidas/page.tsx:204` | Sin episodios, "Reunificación" muestra rojo "0% Peligro" — lee como fracaso total | Con `lostEpisodes===0` → "—" neutral |
| HIGH | Panorama | `gob/mortalidad/page.tsx:168` | Sin muertes, "Trazabilidad" rojo 0% (falsa alarma) y "Desconocida" verde 0% (falso éxito) | Gatear las tarjetas en `hasDeaths` |
| HIGH | Compliance | `travel-compliance.ts:158` | Ítems informativos badgeados "Atención" → semáforo fijo en amarillo, verde inalcanzable | Nivel `info` propio, excluido del test de amarillo |
| HIGH | Admin | `RevokeOrgActions.tsx:187` | Tras revocar, sigue la pastilla verde "Verificada" junto a "revocada" | `navigateAfterActionSuccess` para refrescar SSR |
| HIGH→mod | Libreta | `libreta-export/route.ts:126` | El PDF "oficial" imprime valores pre-corrección (falta `overlayAmendments`) | Traer `event_amended` + aplicar overlay |
| MED→cal | Onboarding | `MinimalNewPetForm.tsx` | El alta nunca captura método de adquisición → panel gob de adquisición sin su entrada principal | `<select acquisitionMethod>` opcional paso 2 |

### Accesibilidad
| Sev | Dominio | Ubicación | Gap | Fix |
|---|---|---|---|---|
| HIGH (×7) | Perdida/Adopción/Foster/Vet/Denuncias/Intake/Compliance | wizards `sr-only`+`aria-hidden` | Pasos inactivos enfocables con teclado dentro de `aria-hidden` — WCAG 4.1.2, en 7 dominios | Reemplazar `sr-only` por `inert` |
| HIGH | Onboarding | `mis-mascotas/page.tsx:212` | `<button>` anidado dentro del `<a>` de next/link en los CTA primarios — HTML inválido | Dar a `LnButton` modo ancla (asChild) |
| HIGH | Adopción | `ApplicationForm.tsx:319` | Los textarea del wizard no tienen nombre accesible; el lector dice "edit text" | `aria-labelledby` a la pregunta |
| HIGH | Public QR | `DegradedCredentialCard.tsx:72` | Los estados degradado/throttled de la credencial no emiten `h1` — el usuario SR pierde orientación | `<h1>` en ambos fallbacks |
| HIGH→mod | Transfers | `ReasignarButton.tsx:62` | Modales de confirmación destructiva usan `<dialog open>` no-modal sin manejo de foco | Usar el `ConfirmDialog` existente (`showModal()`) |

### Usabilidad
| Sev | Dominio | Ubicación | Gap | Fix |
|---|---|---|---|---|
| HIGH | Welfare | `MpfExportButton.tsx:37` | Export a fiscalía usa `window.open` tras un `await` → el popup blocker lo mata pero la UI dice "se abrió". El único output legal desaparece con tilde verde | Renderizar la URL firmada como `<a>` visible |
| HIGH | Transfers | `ReasignarButton.tsx:86` | Reasignar decomiso exige pegar UUID del refugio mientras el alta ya tiene buscador | Reusar el combobox del alta |
| HIGH | Transfers | `AddPartyForm.tsx:96` | Sumar parte a disputa exige pegar UUID crudo *(severidad algo inflada — acción secundaria)* | Búsqueda ligada a la disputa |
| HIGH | Compliance | `viaje/page.tsx:26` | `/viaje` sin ningún enlace entrante — solo por URL tecleada | "Viaje y movilidad" en el menú de la mascota |
| HIGH | Libreta | `MergedShareSheet.tsx:155` | Dos formularios de "crear enlace" en la misma hoja con defaults distintos | Colapsar a una sola superficie |

### Pulido
| Sev | Dominio | Ubicación | Gap | Fix |
|---|---|---|---|---|
| HIGH | Libreta | `libreta-export/route.ts:41` | La libreta imprimible que va al veterinario rotula cada evento en inglés ("Vaccination Administered") — viola es-AR | Usar `eventTypeLabel`/`tipoEventoLabel` |

*(Resto de pulido — acentos en decomisos/disputas/vigilancia, "govt" sin traducir, voseo, brand miMAR/MiMAR — MEDIUM/LOW de un solo pase, no verificados adversarialmente.)*

## 3. Por dominio (una línea)
- **Onboarding & alta**: entregado; no captura método de adquisición, CTA anidan botón en link.
- **Credencial pública / QR**: entregado; los estados fail-soft pierden el `h1`.
- **Perdidas & devolución**: mayormente entregado; propuestas rechazadas reaparecen accionables.
- **Libreta & vacunación**: parcial; nudges código muerto, PDF sin corregir y en inglés.
- **Adopción**: entregado; gate anti-duplicado consulta eventos inexistentes.
- **Foster / tránsito**: **NO entregado** — "vecino en tránsito" inalcanzable.
- **Transferencias, custodia & disputas**: backend ok; disputas/reasignación exigen UUIDs crudos.
- **Veterinario, clínica & turnos**: entregado; wizards con falla de foco.
- **Denuncias Ley 14.346**: entregado; export a fiscalía puede desaparecer con éxito falso.
- **Surveillance & salud pública**: **frágil** — funcionario sin superficie para cerrar observaciones.
- **Panorama & dashboards gob**: entregado; mortalidad pinta falsa alarma roja sin muertes.
- **Consola admin & verificación**: entregado; revocar deja pastilla "Verificada" contradictoria.
- **Portal de organización**: entregado; wizard con falla de foco, controles de 24px.
- **Cumplimiento & movilidad**: **NO entregado** — copiloto de viaje es fachada.

## 4. Top 10 acciones (mayor retorno)
1. **Calidad · Foster** — Restaurar `CustodyKindToggle` en el alta (reactiva el pilar "vecino en tránsito").
2. **Calidad · Compliance** — Decidir viaje: construir "Registrar viaje" o esconder `/viaje` tras flag.
3. **Accesibilidad · 7 dominios** — `sr-only`→`inert` en los wizards (un patrón cierra WCAG 4.1.2 en 7 lugares).
4. **Calidad · Adopción** — Corregir el gate a `adoption_application_resolved`.
5. **Usabilidad · Denuncias** — URL del PDF de fiscalía como link visible.
6. **Calidad · Surveillance** — Superficie real para que el funcionario cierre observaciones rábicas.
7. **Calidad · Panorama/Perdidas** — Gatear KPIs vacíos ("—" neutral) en mortalidad y reunificación.
8. **Calidad · Perdidas** — Usar `hasPendingProposal` en devolución.
9. **Pulido · Libreta** — Traducir el PDF a es-AR + aplicar `overlayAmendments`.
10. **Calidad · Admin** — `navigateAfterActionSuccess` tras revocar org.

## 5. Descartado
- **Ninguno REFUTADO por completo.** Todos los HIGH/CRÍTICO verificados quedaron CONFIRMADOS.
- **Admin · RevokeOrgActions (Rules of Hooks) → degradado a BAJO**: el anti-patrón existe, pero (a) no crashea en camino normal (el padre monta el componente solo con `verified===true`, props estables) y (b) no lo agarra el lint (Biome, `useHookAtTopLevel` inactiva). Vale el fix (riesgo cero) pero no es el HIGH descrito.

---
*Notas: ✓ = pasó verificación adversarial. Pulido/MEDIUM/LOW sin ✓ = primer pase, direccionalmente sólido sin auditoría independiente.*
