# Cross-border corridor requirements — CITED DRAFT (PO validation pending)

> **Feature:** MiMAR "movilidad jurisdiccional" (Fase 1) — populates `lib/reference/cross-border-corridors.ts` `rules: {}`.
> **Ground truth date:** 2026-07-04 (research performed this day; regulations change — re-verify before ship).
> **Scope:** OUTBOUND FROM ARGENTINA only (`direction: outbound_from_ar`), species = dog + cat.
> **Status:** DRAFT for PO/vet validation. Do **NOT** write these into `cross-border-corridors.ts` until the PO confirms each value against the "pages to open" list at the end. Values marked `NO CONFIRMADO` must never ship as fact.

## How to read this

- Field names are in **English** — they match the `TravelRuleType` keys the feature uses (`document_issuance_window_days`, `rabies_vaccination_to_travel_wait_days`, etc.).
- **Confidence:** `CONFIRMADO` (verbatim from an official authority page), `PARCIAL` (official but ambiguous / has a nuance the PO must resolve), `NO CONFIRMADO` (could not confirm from an official source — do not ship).
- **Sources are official ONLY:** SENASA (`argentina.gob.ar/senasa`, the AR export authority) + each destination's animal-import authority (SAG, MGAP/gub.uy, MAPA/VIGIAGRO, EU Commission / MAPA España, CDC / USDA APHIS). No blogs, no relocation companies.
- Notes are es-AR (para el PO); field names stay English.

## ⚠ Two findings that change assumptions in the task brief

1. **UE — Argentina NO necesita test de titulación de rabia (RNATT).** El brief asumía que AR es "non-listed third country" y por eso necesitaría titer (~90 días). **Es al revés:** Argentina figura como país tercero *listado* en el Anexo II, Parte 2 del Reglamento (UE) 577/2013, que está **exento del RNATT y del período de espera de 3 meses**. Confirmado por (a) la página oficial de la Comisión Europea y (b) la propia página de SENASA-UE, que no menciona ningún test serológico. → `rabies_titer_test_required: false` para el corredor UE/España. Esto es lo MÁS importante a validar: un valor mal puesto acá le diría al ciudadano que necesita un test de 3 meses que en realidad no aplica.

2. **Chile — microchip pasó a ser obligatorio muy recientemente.** La página de SENASA-Chile indica que desde el **28/06/2026** se exige identificación permanente por microchip/tatuaje (ISO 11784/11785), implantado antes de la emisión del CVI. Hoy es 2026-07-04, o sea la norma tiene ~6 días de vigencia. Requiere verificación PO/veterinario porque es un cambio caliente y la redacción del sitio todavía habla en futuro.

---

## Corredor 1 — Chile (SAG · Servicio Agrícola y Ganadero)

Autoridad de destino: **SAG**. Fuente principal (lado exportación AR): SENASA "requisitos particulares por destino / Chile".

| Field | Value | Confidence | Official source | Notes (es-AR) |
|---|---|---|---|---|
| `rabies_vaccination_to_travel_wait_days` | 21 | CONFIRMADO | SENASA-Chile [1] | "al menos 21 días previos al ingreso a Chile". Excepción: refuerzo dentro de la vigencia de una vacuna previa no requiere esperar 21 días (mostrar ambos certificados). |
| `rabies_titer_test_required` | false | CONFIRMADO | SENASA-Chile [1] | La página indica expresamente "No se requiere". |
| `rabies_titer_test_wait_days` | 0 | CONFIRMADO | SENASA-Chile [1] | N/A — sin test. |
| `rabies_vaccination_min_age_days` | 0 (sin mínimo; TODOS deben estar vacunados) | PARCIAL | SENASA-Chile [1] | Chile exige vacunación incluso en animales < 90 días. No hay una edad mínima que bloquee el viaje; el criterio es "vacunado y vigente". Confirmar con PO cómo se modela (0 = sin barrera de edad). |
| `microchip_before_vaccination_required` | false | PARCIAL | SENASA-Chile [1] | El microchip **es obligatorio desde 28/06/2026** (ISO 11784/11785), implantado **antes de la emisión del CVI** — pero NO se exige que sea anterior a la vacuna (a diferencia de la UE). Por eso `microchip_before_vaccination_required = false`, aunque "microchip requerido" ahora sea true. Verificar vigencia/texto actualizado. |
| `quarantine_days_required` | 0 (pero hay confinamiento domiciliario 10 días) | PARCIAL | SENASA-Chile [1] / ChileAtiende [2] | No hay cuarentena en instalación. SÍ hay confinamiento en el domicilio de destino por 10 días post-ingreso. Decidir con PO si eso se expone como "cuarentena" o como nota aparte. |
| `import_permit_required` | NO CONFIRMADO (posible "Autorización Sanitaria" del SAG) | NO CONFIRMADO | SAG "Autorización Sanitaria para ingresar a Chile" [3] | SENASA no menciona permiso, pero el SAG publica un trámite de "Solicitud de Autorización Sanitaria para ingresar a Chile con perros y gatos". Verificar si es permiso previo obligatorio o gestión en frontera. NO shippear como false sin confirmar. |
| `document_issuance_window_days` | 10 | CONFIRMADO | SENASA-Chile [1] | CVI emitido "dentro de los 10 días anteriores a la fecha del primer ingreso a Chile" (prorrogable máx. 5 días según viaje). |
| `parasite_treatment_window_days` | 30 (ventana 5–30 días previos al embarque) | CONFIRMADO | SENASA-Chile [1] | Tratamiento antiparasitario interno/externo "mínimo 5 y máximo 30 días previos al embarque". El campo es un número — confirmar con PO si guardamos el límite superior (30) o el rango. |
| `required_documents` | ["CVI/Certificado de salud", "Certificado de vacunación antirrábica", "Certificado de tratamiento antiparasitario", "Documento de identidad del responsable"] | CONFIRMADO | SENASA-Chile [1] | Original + fotocopia según ítem. Agregar "Certificado de implantación/lectura de microchip" si se confirma la norma del 28/06/2026. |
| `required_vaccines` | ["rabia"] | CONFIRMADO | SENASA-Chile [1] | Vacuna antirrábica aprobada por SENASA, vigente. |

---

## Corredor 2 — Uruguay (MGAP · servicios veterinarios)

Autoridad de destino: **MGAP**. Marco: Resolución GMC Mercosur Nº 17/15. Fuente (lado AR): SENASA "Mercosur (Brasil, Paraguay y Uruguay)".

| Field | Value | Confidence | Official source | Notes (es-AR) |
|---|---|---|---|---|
| `rabies_vaccination_to_travel_wait_days` | 21 | CONFIRMADO | SENASA-Mercosur [4] / MGAP [5] | 21 días desde la aplicación cuando es **primovacunación**. Refuerzo dentro de vigencia: sin espera. |
| `rabies_titer_test_required` | false | CONFIRMADO | SENASA-Mercosur [4] | No requerido. |
| `rabies_titer_test_wait_days` | 0 | CONFIRMADO | SENASA-Mercosur [4] | N/A. |
| `rabies_vaccination_min_age_days` | 90 | CONFIRMADO | SENASA-Mercosur [4] | Animales desde 90 días deben ingresar vacunados; menores pueden viajar si se certifica la edad. |
| `microchip_before_vaccination_required` | false | PARCIAL | SENASA-Mercosur [4] | Microchip (ISO 11784/11785) **obligatorio para PERROS > 90 días con destino Uruguay**, pero NO atado a ser previo a la vacuna. `microchip_before_vaccination_required = false`; "microchip requerido (perros)" = true. Nota: no aplica a gatos según la fuente. |
| `quarantine_days_required` | 0 | CONFIRMADO | SENASA-Mercosur [4] | Sin cuarentena. |
| `import_permit_required` | PARCIAL (hay "Solicitud de ingreso con mascotas" online) | PARCIAL | gub.uy trámite ingreso [6] | Uruguay publica un trámite de "Solicitud de ingreso con mascotas al Uruguay". No es un permiso de importación clásico, pero es una gestión previa. Confirmar con PO si se modela como `import_permit_required`. |
| `document_issuance_window_days` | 10 | CONFIRMADO | SENASA-Mercosur [4] / MGAP [5] | Examen clínico dentro de los 10 días previos a la emisión del CVI. |
| `parasite_treatment_window_days` | 15 | CONFIRMADO | SENASA-Mercosur [4] | Desparasitación interna/externa dentro de los 15 días previos a la emisión del CVI. **Perros a Uruguay: el antiparasitario interno debe contener Praziquantel.** |
| `required_documents` | ["CVI (GMC 17/15)", "Certificado de vacunación antirrábica", "Certificado de tratamiento antiparasitario (Praziquantel en perros)", "Certificado de microchip (perros)", "Serología Leishmaniasis negativa (perros)"] | CONFIRMADO | SENASA-Mercosur [4] / MGAP [5] | Alternativa al CVI: pasaporte oficial vigente con toda la info sanitaria. |
| `required_vaccines` | ["rabia"] | CONFIRMADO | SENASA-Mercosur [4] | — |

> **Nota Leishmaniasis (perros a Uruguay):** prueba serológica (IFAT/ELISA/aglutinación directa/detección molecular) con resultado **negativo dentro de los 60 días previos al embarque**, solo para caninos > 90 días. No hay un `TravelRuleType` dedicado — va en `required_documents` o como nota de checklist. Es un requisito real y sensible; marcarlo para el veterinario.

---

## Corredor 3 — Brasil (MAPA / VIGIAGRO · CVI Mercosur)

Autoridad de destino: **MAPA / VIGIAGRO**. Marco: GMC Mercosur Nº 17/15 + Portaria MAPA nº 741 de 10/12/2024. Fuente (lado AR): misma página SENASA-Mercosur.

| Field | Value | Confidence | Official source | Notes (es-AR) |
|---|---|---|---|---|
| `rabies_vaccination_to_travel_wait_days` | 21 | CONFIRMADO | SENASA-Mercosur [4] | 21 días en primovacunación. |
| `rabies_titer_test_required` | false | CONFIRMADO | SENASA-Mercosur [4] | No requerido. |
| `rabies_titer_test_wait_days` | 0 | CONFIRMADO | SENASA-Mercosur [4] | N/A. |
| `rabies_vaccination_min_age_days` | 90 | CONFIRMADO | SENASA-Mercosur [4] / MAPA [7] | "Todos os animais a partir de 90 dias de idade devem ingressar vacinados contra a raiva." |
| `microchip_before_vaccination_required` | false | CONFIRMADO | SENASA-Mercosur [4] | Para ingreso a Brasil por CVI Mercosur el microchip NO es requisito (solo lo es para Uruguay). Sin relación con orden vacuna/chip. |
| `quarantine_days_required` | 0 | CONFIRMADO | SENASA-Mercosur [4] / MAPA [7] | Sin cuarentena. |
| `import_permit_required` | false | CONFIRMADO | MAPA "Entrar no Brasil" [7] | Mercosur reconoce CVI o pasaporte oficial como documento válido; no hay permiso de importación adicional. |
| `document_issuance_window_days` | 10 | PARCIAL | SENASA-Mercosur [4] | Examen clínico/emisión del CVI dentro de los 10 días previos. Confirmar que aplica idéntico a Brasil (la fuente agrupa Mercosur). |
| `parasite_treatment_window_days` | 15 | PARCIAL | SENASA-Mercosur [4] | Desparasitación dentro de 15 días previos a la emisión del CVI (regla Mercosur general). Praziquantel es requisito explícito de Uruguay, no de Brasil — confirmar el detalle Brasil-específico con MAPA. |
| `required_documents` | ["CVI o Pasaporte oficial (GMC 17/15)", "Certificado de vacunación antirrábica", "Certificado de tratamiento antiparasitario"] | CONFIRMADO | SENASA-Mercosur [4] / MAPA [7] | CVI válido 60 días corridos desde emisión, si la antirrábica está vigente. |
| `required_vaccines` | ["rabia"] | CONFIRMADO | SENASA-Mercosur [4] | — |

---

## Corredor 4 — Unión Europea / España (Reg. (UE) 576/2013 + 577/2013)

Autoridad: **Comisión Europea** (marco) + **MAPA España** (entrada). Fuente (lado AR): SENASA "requisitos por destino / Unión Europea". Base legal citada por SENASA: Reg. (UE) 576/2013 (Anexos II y III), Reg. de Ejecución (UE) 577/2013 y 2016/561, Reg. Delegado (UE) 2018/772.

| Field | Value | Confidence | Official source | Notes (es-AR) |
|---|---|---|---|---|
| `rabies_vaccination_to_travel_wait_days` | 21 | CONFIRMADO | SENASA-UE [8] (Reg. 576/13) | 21 días desde la aplicación. Refuerzo dentro de vigencia: sin espera. |
| `rabies_titer_test_required` | **false** | CONFIRMADO | Comisión Europea (listado Art. 17(1)(b)) [9] + SENASA-UE [8] | **AR es país listado (Anexo II Parte 2 de 577/2013) → exento de RNATT y del período de 3 meses.** La página de la Comisión lista "AR" y dice que esos países "do not require a rabies antibody titration test". SENASA-UE no menciona titer. Ver hallazgo #1 arriba. |
| `rabies_titer_test_wait_days` | 0 | CONFIRMADO | Comisión Europea [9] | N/A para AR — exento. (Un país NO listado necesitaría ~90 días; AR no.) |
| `rabies_vaccination_min_age_days` | 84 (12 semanas) | CONFIRMADO | SENASA-UE [8] | Vacuna aplicada "desde las 12 semanas de vida" (84 días). Edad mínima de ingreso a la UE: 3 meses y 21 días. **España no acepta perros/gatos menores de 3 meses.** |
| `microchip_before_vaccination_required` | **true** | CONFIRMADO | SENASA-UE [8] | La fecha de implantación/lectura del microchip debe ser **anterior a la fecha de la vacuna antirrábica (o el mismo día)**. Verificar lectura dentro de los 10 días previos al viaje. Microchip ISO 11784/11785 obligatorio. |
| `quarantine_days_required` | 0 | CONFIRMADO | SENASA-UE [8] | Sin cuarentena. |
| `import_permit_required` | false | CONFIRMADO | SENASA-UE [8] / MAPA España [10] | Sin permiso de importación; se viaja con AHC + certificados. |
| `document_issuance_window_days` | 10 | CONFIRMADO | SENASA-UE [8] | Animal Health Certificate (AHC) emitido dentro de los 10 días previos a los controles documentales de entrada a la UE. |
| `parasite_treatment_window_days` | 0 para España (24–120 h solo FI/IE/MT/NO) | CONFIRMADO | SENASA-UE [8] | Tratamiento contra *Echinococcus multilocularis* (Praziquantel) SOLO exigido por Finlandia, Irlanda, Malta y Noruega, entre 24 y 120 h previas al ingreso. **España NO lo exige** → 0 para el corredor España. Si el corredor se rotula "UE genérico", flaggear que 4 países sí lo piden. |
| `required_documents` | ["Certificado de microchip", "Certificado de vacunación antirrábica", "Animal Health Certificate (AHC) UE 577/2013", "Documento de identidad del responsable", "Domicilio en la UE"] | CONFIRMADO | SENASA-UE [8] | — |
| `required_vaccines` | ["rabia"] | CONFIRMADO | SENASA-UE [8] | Solo antirrábica; no se exigen otras vacunas. |

---

## Corredor 5 — Estados Unidos (CDC + USDA APHIS)

Autoridad de destino: **CDC** (perros) + **USDA APHIS** / estado de destino. Fuente (lado AR): SENASA "requisitos por destino / EE.UU." (la fetch directa dio 403; datos tomados del resumen oficial de SENASA + páginas CDC).

**Clasificación de rabia de AR:** Argentina **NO** figura en la lista CDC de países de alto riesgo de rabia canina (lista con fecha de vigencia 15/04/2026) → AR se trata como país **"rabies-free / low-risk"**. Eso simplifica muchísimo el corredor.

| Field | Value | Confidence | Official source | Notes (es-AR) |
|---|---|---|---|---|
| `rabies_vaccination_to_travel_wait_days` | 0 (CDC no lo exige a AR; SENASA sí pide certificado antirrábico vigente para el CVI) | PARCIAL | CDC low-risk [12] / SENASA-USA [11] | Para países low-risk el CDC **recomienda** pero no **exige** vacuna antirrábica. Pero el CVI de SENASA igual pide certificado de vacunación antirrábica. Confirmar con PO/veterinario cómo se modela (0 días de espera CDC, pero vacuna presente). |
| `rabies_titer_test_required` | false | CONFIRMADO | CDC low-risk [12] | No requerido para AR (low-risk). |
| `rabies_titer_test_wait_days` | 0 | CONFIRMADO | CDC low-risk [12] | N/A. |
| `rabies_vaccination_min_age_days` | NO CONFIRMADO (CDC exige edad mínima 6 meses del PERRO, no de la vacuna) | PARCIAL | CDC low-risk [12] | El CDC exige que el **perro** tenga ≥ 6 meses al ingresar, no fija edad mínima de vacuna para low-risk. No es lo mismo que el campo. Confirmar con PO qué guardar (posible 0). |
| `microchip_before_vaccination_required` | false | PARCIAL | CDC dog import [13] | El CDC exige microchip (perros), y la regla general CDC dice "microchip antes de la vacuna" — pero eso aplica a la vacuna que el CDC valida (países high-risk). Para AR (low-risk) no se valida vacuna, así que el orden chip→vacuna no es requisito operativo. `false`, pero flaggear el matiz. |
| `quarantine_days_required` | 0 | CONFIRMADO | CDC low-risk [12] | Sin cuarentena. |
| `import_permit_required` | true — **CDC Dog Import Form** (perros) | CONFIRMADO | CDC form [13] / SENASA-USA [11] | No es "permiso" clásico, pero es un formulario obligatorio del CDC que hay que enviar y cuyo comprobante se presenta al ingresar y a la aerolínea. Válido 6 meses / múltiples ingresos. Modelar como `import_permit_required: true` para perros (decidir con PO). **Gatos: el CDC no regula gatos.** |
| `document_issuance_window_days` | 5 | CONFIRMADO | SENASA-USA [11] | Certificado de salud (perros y gatos) y certificado libre de miasis (caninos) emitidos por el veterinario privado dentro de los 5 días previos al embarque (día de emisión inclusive). |
| `parasite_treatment_window_days` | NO CONFIRMADO (hay certificado "libre de miasis" para caninos, sin ventana explícita) | NO CONFIRMADO | SENASA-USA [11] | SENASA menciona "certificado libre de miasis" para caninos dentro de los 5 días, pero no una desparasitación tipo Echinococcus con ventana. No inventar un número. |
| `required_documents` | ["CDC Dog Import Form (perros)", "Certificado de salud", "Certificado de vacunación antirrábica", "Certificado libre de miasis (caninos)", "Certificado de microchip (perros)", "Documento de identidad del responsable"] | CONFIRMADO | SENASA-USA [11] / CDC [12][13] | Recomendado consultar requisitos del **estado** de destino (pueden diferir). |
| `required_vaccines` | ["rabia"] (por CVI SENASA; CDC no la exige a low-risk) | PARCIAL | SENASA-USA [11] / CDC [12] | El CVI SENASA incluye antirrábica; el CDC no la exige para AR. Confirmar el modelado con PO. |

> **Gatos a EE.UU.:** el CDC no regula la importación de gatos. Aplican los requisitos de SENASA (certificado de salud) y, eventualmente, del estado de destino / USDA APHIS. Marcar que el corredor USA tiene reglas **distintas por especie** (perro vs gato) — el modelo actual aplica las mismas reglas a ambos, y acá eso NO es fiel.

---

## Sección aparte — Argentina EXPORT (SENASA · aplica a TODOS los corredores)

Esto no es un corredor: es el proceso de emisión del **Certificado Veterinario Internacional (CVI)** que SENASA exige para cualquier salida. Va como capa común (documento base + ventanas de trámite).

| Ítem | Valor | Confidence | Official source | Notes (es-AR) |
|---|---|---|---|---|
| Documento base | CVI emitido por SENASA según exigencias del país de destino | CONFIRMADO | SENASA CVI digital [14] / procedimiento [15] | El veterinario privado matriculado certifica el cumplimiento (vacunas, tratamientos, certificados). |
| Modalidad | CVI digital con firma electrónica (Sistema de Mascotas) | CONFIRMADO | SENASA CVI digital [14] | Trámite 100% online: carga de documentación → obtención del certificado sin ir a la oficina. |
| Plazo de análisis SENASA | hasta 72 horas hábiles | CONFIRMADO | SENASA [15] | Se adjunta la documentación sanitaria del destino; SENASA la analiza en ≤ 72 h hábiles. |
| Validez del CVI | 60 días corridos desde emisión | CONFIRMADO | SENASA / GMC Mercosur 17/15 [15] | Válido siempre que la antirrábica esté vigente. (Nota: para Mercosur el mismo CVI sirve ingreso/retorno/tránsito.) |
| Docs de entrada al CVI | Certificado de vacunación antirrábica + Certificado de salud, de veterinario privado matriculado | CONFIRMADO | SENASA [15] | Base común; cada destino agrega los suyos (microchip, antiparasitario, serologías). |

> **Implicancia para el modelo:** `document_issuance_window_days` en la tabla de cada corredor se refiere a la ventana del certificado del **destino** (AHC 10 días UE, health cert 5 días USA, CVI 10 días Chile/Mercosur). La validez de 60 días del CVI SENASA es transversal y probablemente merezca su propio campo o nota, no confundir con la ventana de emisión.

---

## ¿Listo para poblar `cross-border-corridors.ts`? — checklist por corredor

Leyenda: ✅ sólido (CONFIRMADO, se puede proponer al PO) · ⚠ necesita decisión de modelado/confirmación · ⛔ NO shippear sin confirmar.

### Chile
- ✅ `rabies_vaccination_to_travel_wait_days=21`, `rabies_titer_test_required=false`, `document_issuance_window_days=10`, `parasite_treatment_window_days=30`, `required_vaccines=[rabia]`, `quarantine=0` (formal).
- ⚠ `rabies_vaccination_min_age_days` (Chile vacuna incluso < 90 días → modelar como 0), `microchip_before_vaccination_required` (microchip nuevo desde 28/06/2026, pero no atado a la vacuna), confinamiento domiciliario 10 días (¿cómo se expone?).
- ⛔ `import_permit_required` — verificar la "Autorización Sanitaria" del SAG antes de poner false.

### Uruguay
- ✅ `rabies_wait=21`, `titer=false`, `min_age=90`, `document_issuance_window=10`, `parasite_treatment_window=15`, `quarantine=0`, `required_vaccines=[rabia]`.
- ⚠ `microchip` (obligatorio solo perros, no atado a vacuna → `microchip_before_vaccination_required=false`), `import_permit_required` (trámite "solicitud de ingreso" gub.uy), Leishmaniasis perros (va en required_documents / nota), Praziquantel obligatorio en perros.
- Reglas por especie: microchip + Leishmaniasis son SOLO perros. El modelo aplica reglas iguales a perro/gato — flaggear.

### Brasil
- ✅ `rabies_wait=21`, `titer=false`, `min_age=90`, `microchip_before_vaccination=false`, `quarantine=0`, `import_permit=false`, `required_vaccines=[rabia]`, CVI válido 60 días.
- ⚠ `document_issuance_window=10` y `parasite_treatment_window=15` (regla Mercosur agrupada — confirmar Brasil-específico con MAPA; Praziquantel es de Uruguay, no de Brasil).

### UE / España
- ✅ `rabies_wait=21`, **`rabies_titer_test_required=false` (AR listado)**, `rabies_vaccination_min_age_days=84`, **`microchip_before_vaccination_required=true`**, `quarantine=0`, `import_permit=false`, `document_issuance_window=10`, `parasite_treatment_window=0` (España), `required_vaccines=[rabia]`.
- ⚠ Rótulo del corredor: si es "UE genérico" y no "España", el tratamiento Echinococcus (24–120 h) aplica a FI/IE/MT/NO. El id es `ue_espana`, así que España = 0 está bien; dejar nota.
- **Corrección crítica:** NO poner titer=true. AR está exento (hallazgo #1).

### USA
- ✅ `titer=false`, `titer_wait=0`, `quarantine=0`, `document_issuance_window=5`, `import_permit_required=true` (CDC Dog Import Form, perros).
- ⚠ `rabies_vaccination_to_travel_wait_days` (CDC no exige a AR low-risk; SENASA pide cert), `required_vaccines` (rabia por CVI SENASA, no por CDC), `microchip_before_vaccination_required` (false para low-risk).
- ⛔ `rabies_vaccination_min_age_days` — CDC fija edad del PERRO (6 meses), no de la vacuna; NO CONFIRMADO como valor del campo. `parasite_treatment_window_days` — NO CONFIRMADO (solo "libre de miasis" sin ventana). No inventar.
- Reglas por especie: el CDC regula SOLO perros; gatos van por SENASA/estado. El corredor USA es el más asimétrico perro/gato — flaggear fuerte.

### Transversal (todos)
- Validez CVI SENASA = 60 días: transversal, no es `document_issuance_window_days`. Definir con PO si necesita campo propio.
- El modelo actual aplica las mismas `rules` a perro y gato (`species: ["dog","cat"]`). Varios requisitos (microchip Uruguay, Leishmaniasis Uruguay, CDC Form USA) son SOLO perros. Antes de poblar, decidir con PO si Fase 1 acepta esa simplificación (y lo dice el disclaimer) o si hace falta diferenciar por especie.

---

## Páginas oficiales que el PO debe abrir para verificar

**Argentina — SENASA (export, aplica a todos)**
- [14] CVI digital: https://www.argentina.gob.ar/senasa/cvi-digital
- [15] Procedimiento para viajar al exterior con perros y gatos: https://www.argentina.gob.ar/senasa/procedimiento-para-viajar-al-exterior-con-perros-y-gatos
- Índice de requisitos por destino: https://www.argentina.gob.ar/senasa/requisitos-particulares-por-destino
- Auto-gestión requisitos por país: https://mascotas.senasa.gob.ar/index.php/consultar_requisitos

**Chile**
- [1] SENASA-Chile (lado AR): https://www.argentina.gob.ar/senasa/requisitos-particulares-por-destino/chile
- [2] ChileAtiende (confinamiento/ingreso): https://www.chileatiende.gob.cl/fichas/2602-autorizacion-sanitaria-para-ingresar-y-salir-de-chile-con-perros-gatos-y-hurones-mascotas
- [3] SAG Autorización Sanitaria para ingresar: https://www.sag.gob.cl/tramites/solicitud-de-autorizacion-sanitaria-para-ingresar-chile-con-perros-y-gatos-mascotas
- SAG ingreso/salida de mascotas: https://www.sag.gob.cl/ambitos-de-accion/ingreso-o-salida-de-mascotas-y-especies-animales-y-vegetales-protegidas

**Uruguay**
- [4] SENASA-Mercosur (lado AR): https://www.argentina.gob.ar/senasa/requisitos-particulares-por-destino/mercosur-brasil-paraguay-uruguay
- [5] MGAP "Personas que viajan con mascotas": https://www.gub.uy/ministerio-ganaderia-agricultura-pesca/politicas-y-gestion/personas-viajan-mascotas
- [6] Solicitud de ingreso con mascotas al Uruguay: https://www.gub.uy/tramites/solicitud-ingreso-mascotas-uruguay

**Brasil**
- [4] SENASA-Mercosur (misma página, lado AR)
- [7] MAPA "Entrar no Brasil": https://www.gov.br/agricultura/pt-br/assuntos/vigilancia-agropecuaria/animais-estimacao/entrar-no-brasil
- Portaria MAPA nº 741 de 10/12/2024 (CVI Mercosur): https://www.gov.br/agricultura (buscar Portaria 741/2024)

**UE / España**
- [8] SENASA-UE (lado AR): https://www.argentina.gob.ar/senasa/informacion-al-viajero/viajar-al-exterior/envios-al-exterior-perros-yo-gatos/requisitos-particulares-por-destino/union-europea
- [9] Comisión Europea — listado de países/territorios (Art. 17(1)(b), Anexo II): https://food.ec.europa.eu/animals/movement-pets/eu-legislation/listing-territories-and-non-eu-countries_en
- [10] MAPA España — viajar con perros/gatos/hurones: https://www.mapa.gob.es/en/ganaderia/temas/comercio-exterior-ganadero/desplazamiento-animales-compania/viajar-perros-gatos-hurones
- Reg. (UE) 577/2013 (EUR-Lex): https://eur-lex.europa.eu/eli/reg_impl/2013/577/oj
- Reg. (UE) 576/2013 (EUR-Lex): https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX%3A32013R0576

**USA**
- [11] SENASA-USA (lado AR): https://www.argentina.gob.ar/senasa/requisitos-particulares-por-destino/usa  *(nota: dio 403 al fetch automático; abrir en navegador)*
- [12] CDC — dogs from rabies-free/low-risk countries: https://www.cdc.gov/importation/dogs/rabies-free-low-risk-countries.html
- [13] CDC — Dog Import Form & instrucciones: https://www.cdc.gov/importation/dogs/dog-import-form-instructions.html
- CDC — lista de países high-risk (verificar que AR sigue fuera; vigencia 15/04/2026): https://www.cdc.gov/importation/dogs/high-risk-countries.html
- USDA APHIS — pet travel: https://www.aphis.usda.gov/pet-travel

---

## Referencias (numeradas, usadas en las tablas)

1. SENASA — Requisitos particulares por destino / Chile — https://www.argentina.gob.ar/senasa/requisitos-particulares-por-destino/chile
2. ChileAtiende — Autorización sanitaria ingreso/salida perros, gatos y hurones — https://www.chileatiende.gob.cl/fichas/2602-autorizacion-sanitaria-para-ingresar-y-salir-de-chile-con-perros-gatos-y-hurones-mascotas
3. SAG — Solicitud de Autorización Sanitaria para ingresar a Chile con perros y gatos — https://www.sag.gob.cl/tramites/solicitud-de-autorizacion-sanitaria-para-ingresar-chile-con-perros-y-gatos-mascotas
4. SENASA — Mercosur (Brasil, Paraguay y Uruguay) — https://www.argentina.gob.ar/senasa/requisitos-particulares-por-destino/mercosur-brasil-paraguay-uruguay
5. MGAP — Personas que viajan con mascotas — https://www.gub.uy/ministerio-ganaderia-agricultura-pesca/politicas-y-gestion/personas-viajan-mascotas
6. gub.uy — Solicitud de ingreso con mascotas al Uruguay — https://www.gub.uy/tramites/solicitud-ingreso-mascotas-uruguay
7. MAPA — Entrar no Brasil (VIGIAGRO) — https://www.gov.br/agricultura/pt-br/assuntos/vigilancia-agropecuaria/animais-estimacao/entrar-no-brasil
8. SENASA — Requisitos por destino / Unión Europea — https://www.argentina.gob.ar/senasa/informacion-al-viajero/viajar-al-exterior/envios-al-exterior-perros-yo-gatos/requisitos-particulares-por-destino/union-europea
9. Comisión Europea (Food Safety) — Listing of territories and non-EU countries — https://food.ec.europa.eu/animals/movement-pets/eu-legislation/listing-territories-and-non-eu-countries_en
10. MAPA España — Travelling with dogs, cats and ferrets — https://www.mapa.gob.es/en/ganaderia/temas/comercio-exterior-ganadero/desplazamiento-animales-compania/viajar-perros-gatos-hurones
11. SENASA — Requisitos por destino / EE.UU. — https://www.argentina.gob.ar/senasa/requisitos-particulares-por-destino/usa
12. CDC — Entry Requirements for Dogs from Dog-Rabies Free or Low-Risk Countries — https://www.cdc.gov/importation/dogs/rabies-free-low-risk-countries.html
13. CDC — Dog Import Form and Instructions — https://www.cdc.gov/importation/dogs/dog-import-form-instructions.html
14. SENASA — CVI digital — https://www.argentina.gob.ar/senasa/cvi-digital
15. SENASA — Procedimiento para viajar al exterior con perros y gatos — https://www.argentina.gob.ar/senasa/procedimiento-para-viajar-al-exterior-con-perros-y-gatos

---

*Draft generado 2026-07-04. Toda la data regulatoria es DRAFT: requiere validación del PO (y idealmente de un veterinario matriculado) contra las páginas oficiales listadas antes de escribirse en `lib/reference/cross-border-corridors.ts`. Ante la duda entre un valor y un `NO CONFIRMADO`, gana el `NO CONFIRMADO`: un número de cuarentena o de espera mal puesto es mal consejo a un ciudadano.*
