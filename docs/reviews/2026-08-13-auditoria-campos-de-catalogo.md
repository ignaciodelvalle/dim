# Qué campos tienen que salir de un catálogo — auditoría del sistema completo

Disparada por una decisión del PO (2026-08-13): la raza debería elegirse de un
catálogo y no tipearse. La pregunta que siguió —"¿en qué otros campos también?"—
merece una respuesta medida, no una lista de intuiciones.

## El criterio

No es "¿esto parece una lista?". Es: **¿algo compara este texto?**

Un campo libre que nadie compara está perfecto libre — el nombre de la mascota,
las señas particulares, la historia de adopción. Nadie los agrupa ni los evalúa.

Un campo libre que alimenta una regla, una autorización o un agregado es otra
cosa. Ahí el texto no es texto: es una **clave**, y una clave que cada persona
escribe distinta no es una clave.

Tres niveles de consecuencia, y ordenan la urgencia:

1. **Legal / autorización** — decide si una ley te alcanza o quién puede verte.
2. **Agregado** — decide qué dice una estadística nacional.
3. **Presentación** — se muestra y nada más.

## El patrón de la casa ya existe. Dos veces.

Esto es lo que más importa de toda la auditoría: **el repo ya resolvió este
problema, bien, y no lo propagó.**

`lib/reference/vaccine-fuzzy-match.ts` y `lib/domain/symptom-matcher.ts` hacen
exactamente lo que hay que hacer, y el docblock del primero lo dice sin vueltas:

> CONSERVATIVE BY DESIGN — this is a government registry feed, not a search box.

El patrón tiene tres partes, y la tercera es la que casi nadie escribe:

- normalización (NFD, sin diacríticos, sin separadores) + sinónimos;
- Levenshtein acotado a 1, barato porque el catálogo es chico;
- **regla de empate ambiguo: si dos candidatos calificarían solos, no gana
  ninguno.** Se ofrecen para que la persona elija. El sistema no adivina.

Y hay un cuarto patrón, distinto y también correcto, en `performed_by`: **FK a la
identidad + snapshot de texto congelado**. La FK se compara, el texto solo se
muestra, y el snapshot preserva cómo se llamaba la clínica el día del evento —
que es lo que corresponde en una bitácora append-only.

Entre los dos cubren todo. Lo que sigue es el inventario de quién los usa y quién
no.

## El inventario

### Ya está bien — no tocar

| Campo | Cómo se protege |
|---|---|
| `performed_by` (eventos clínicos) | FK `performed_by_organization_id` / `_user_id` + snapshot de texto. El schema exige el snapshot cuando hay FK. |
| Vacunas (nombre) | `vaccine-fuzzy-match.ts` con cutoff de autoselección y regla de empate. |
| Síntomas | `symptom-matcher.ts`, mismo patrón. |
| `disease_code` | Validado contra catálogo **en el schema del evento**: un código fuera del catálogo es un error de validación, no un dato. |
| `adoption_ineligible_reason`, `rabies_observation_status`, `adoption_energy_level`, `adoption_size_estimate`, `adoption_age_bucket`, `permanent_conditions` | CHECK en la base. |

Vale la pena notar la disciplina: la tabla `pets` tiene CHECK para el nivel de
energía y el rango etario de un aviso de adopción. Los campos que faltan no
faltan por descuido general — faltan justo los tres que más pesan.

### Falta, ordenado por daño

#### 1 · `pets.breed` — consecuencia LEGAL, daño ya ocurrido

Decide si a un perro le aplica el régimen PPP (Ley CABA 4078, Ley Prov. 14.107).
El catálogo `DOG_BREEDS` existe pero **sólo alimenta un `<datalist>`**; el propio
header lo documenta: *"Users can also type a breed not in the list — we just
don't get the auto-flag if so."* Conocido y aceptado.

Medido en staging el 2026-08-13:

- **69 mascotas con raza cargada, en 44 valores distintos, 34 usados una sola vez.**
  Un 64% de valores únicos. Eso es lo que el texto libre produce.
- Duplicados por escritura: `Mestizo` / `mestizo` / `Mestiza`, `Border Collie` /
  `Border collie`, `Caniche Toy` / `Caniche toy`, `Ovejero alemán` /
  `Ovejero Alemán`, `Galgo` / `Galgo (Greyhound)`.
- Y el hallazgo:

  | raza | jurisdicción | PPP |
  |---|---|---|
  | `Pitbull` | CABA / Recoleta | **true** |
  | `Pit Bull Terrier Americano` | CABA / Palermo | **false** |

  Dos perros, la misma ciudad, la misma ley. Uno marcado porque un humano parcheó
  a mano la regla de Recoleta; el otro no, porque nadie parcheó la de Palermo.
  Lo que decide si una ley te alcanza es **cómo lo escribió el dueño**.

**Recomendación.** Selección de catálogo en el formulario, y el patrón de vacunas
para el texto que ya está cargado y para cualquier ingreso por API. La tabla de
alias que se agregó hoy achica el agujero — no lo cierra, y no podía: nada en el
matcher predijo "Pit Bull Terrier Americano". Lo encontró alguien leyendo datos.

**Nota operativa:** el cron `business_rules_reeval` incluye un barrido AR por
defecto además de las jurisdicciones con regla propia, así que una mejora del
matcher **sí** re-clasifica las filas existentes. No hace falta un backfill a
mano.

> **Corrección (misma sesión, después de medir).** Las dos secciones que seguían
> decían que faltaban CHECK de provincia en `pets` y en otras tablas. **Era
> falso.** Lo saqué de un `awk` que cortaba la tabla `pets` antes de tiempo, en
> vez de preguntarle a la base. `pg_constraint` dice que **las trece tablas con
> jurisdicción ya tienen el CHECK canónico**, `pets` incluida. La provincia está
> completamente protegida y no había nada que hacer. Lo dejo escrito porque el
> error es del mismo tipo que este documento denuncia: leer el repo y creer que
> describe la base.
>
> El único hueco real era `species`. Y buscándolo apareció algo peor — ver
> "Deriva estructural" al final.

#### 2 · `pets.species` — consecuencia LEGAL, sin daño hoy

`isPotentiallyDangerousBreed` arranca con `if (species !== "dog") return false`.
Es la compuerta del régimen entero. Un `"Perro"`, un `"dog "` o un `"DOG"` lo
apagan por completo, en silencio.

Hoy la base está limpia: 5 valores, todos canónicos (`dog` 36.740, `cat` 25.548,
`rabbit` 2.610, `other` 1.958, `guinea_pig` 2). Pero está limpia **por
convención, no por construcción**: no hay CHECK. La comparan además los
agregados.

**Recomendación.** Un CHECK. Es lo más barato de toda esta lista y protege lo más
caro.

#### 3 · `pets.jurisdiction_province` — YA ESTÁ PROTEGIDA. Nada que hacer.

Aparece en **19 `GROUP BY`** de analítica y define el scope de autorización de
cada operador de gobierno, así que la preocupación estaba bien puesta. Pero la
medición la desmintió: `pets_jurisdiction_province_canonical` existe, y también
existe la equivalente en `organizations`, `profiles`, `service_offerings`,
`welfare_reports`, `cases`, `custody_disputes`, `foster_volunteers`,
`organization_coverage`, `approval_requests`, `govt_business_rules`,
`govt_assignments` y `ar_localities`. Trece tablas, cero excepciones.

Y los datos acompañan: **cero valores no canónicos** en las diez tablas
consultadas, las 24 provincias exactas.

Más: `pets.locality_id` es FK a `ar_localities` y está poblada en **66.848 de
66.850** filas con localidad; el texto coincide con la FK en **el 100%** de
ellas, y ninguna apunta a una localidad dada de baja. La integridad
jurisdiccional de este sistema está mejor de lo que yo asumí.

#### 4 · `pets.jurisdiction_locality` — 6 `GROUP BY`, subsunción y búsqueda

Es el campo del bug del buscador de turnos que se arregló hoy. Más difícil que la
provincia: el catálogo INDEC tiene una entrada por ciudad y los 48 barrios de
CABA son un overlay más fino, así que un CHECK plano no sirve.

Y hay una entrada que lo escribe libre: el intake de organizaciones pide
jurisdicción como texto, mientras el alta de voluntario y la mudanza usan
autocomplete. Esa asimetría la reportó el clickthrough como un problema de
unificación; es más que eso — es la puerta por la que va a entrar la divergencia.

**Recomendación.** Unificar el intake al mismo autocomplete antes de pensar en
constraints. Cerrar la puerta primero.

## Lo que NO hay que convertir en catálogo

Para que la lista signifique algo tiene que tener un afuera:

`name`, `distinguishing_features`, `adoption_story`, `adoption_requirements`,
`insurance_company`, `preferred_vet_name`, `emergency_contact_name`, las notas de
cualquier formulario. Nadie los compara, nadie los agrupa, ninguna regla los lee.
Encorsetarlos sólo agrega fricción.

`color` está en el borde: hoy es presentación, pero si alguna vez alimenta
búsqueda de mascotas perdidas pasa a ser clave y cambia de categoría.

## Deriva estructural — lo que apareció buscando el CHECK de `species`

Al preguntarle a `pg_constraint` en vez de al repo, salió algo que ninguna
lectura del código podía encontrar: **el repo y staging no describen la misma
base.** `scripts/check-env-schema-drift.ts` (nuevo) compara dos bases por
constraints e índices, y contra staging dio **23 diferencias**.

La peor era de la categoría más peligrosa: **mismo nombre, definición distinta.**

| | `approval_requests.approval_type_valid` |
|---|---|
| staging | `role_upgrade_vet`, `organization_verification`, **`service_dog_credential_verification`** |
| una base construida desde las migraciones | `role_upgrade_vet`, `organization_verification` |

Y el código **inserta el tercero**:
`src/modules/pets/application/service-dog/submit-verification-request.ts:70`. Es
la solicitud de verificación de credencial de perro de asistencia — Ley 26.858,
Dec. 792/2019, RUPGA/ANDIS.

O sea: **esa funcionalidad anda en staging únicamente porque alguien parcheó la
constraint a mano ahí.** En cualquier base nueva —el local de quien clone hoy,
producción si se reconstruye— el flujo falla con violación de constraint. Nadie
lo notó porque el clickthrough documentó la pantalla sin enviarla ("dato
sensible; alcanza con documentar"), que fue la decisión correcta y aun así dejó
el agujero tapado.

La dirección del arreglo no la decidió mi criterio: el código escribe ese valor y
`db/schema.ts` ya lo declaraba. Faltaba la migración, nada más. Es la 0178.

Lo demás que reportó el comparador: los restos de la migración 0084 que nunca se
ejecutaron en staging (`pets_tattoo_location_valid`, `pets_tattoo_code_idx` —
mismo modo de falla que la 0172 de esta semana), varios renombres cosméticos
(`pet_tags_*_check` vs `_valid`, `push_subscriptions_endpoint_key` vs `_unique`,
los `pkey` de panorama) y cuatro índices que staging tiene de más. Los renombres
y los índices **no los toqué**: no probé que hagan daño, y churnearlos a ciegas
sería exactamente la clase de movimiento que produjo esta deriva. Quedan
visibles, que es lo que faltaba.

## El orden que propongo

**Hecho (migración 0178):**

1. `approval_type_valid` con los tres valores — desbloquea un flujo legal que
   estaba roto en toda base nueva.
2. `pets_species_valid` — protege la compuerta del régimen PPP.
3. Los restos de la 0084 que no llegaron a staging.

4. **Raza por catálogo** (decisión del PO, mismo día). El campo dejó de ser
   texto libre y pasó a `<select>`; los datos viejos se normalizaron con
   `scripts/repair-breeds.ts`; `lint:catalogs` (en `verify` **y** en CI) falla si
   vuelve a aparecer un valor fuera de catálogo.

   Al normalizar apareció un SEGUNDO perro escapándose de la ley, y este no lo
   hubiera predicho ningún matcher: **"Ovejero alemán"**. La regla PPP de CABA
   lista `"Pastor Alemán"` — el perro estaba cargado con el nombre que usa medio
   país y no matcheaba la regla de su propia ciudad. Los dos quedaron
   reclasificados con `scripts/rederive-ppp.ts`, que **importa** el clasificador
   del cron en vez de reimplementarlo: escribir el régimen a mano en un UPDATE
   es cómo se fabrica la próxima divergencia.

   Y validando "catálogo siempre que se pueda" salieron dos huecos más: faltaban
   catálogos enteros (conejo y cobayo no tenían, por eso "Conejo común" no
   resolvía — el dato no estaba mal, no había dónde ponerlo) y faltaban siete
   razas reales de perro. Se agregaron. Aplastarlas a "Pura raza no listada"
   habría destruido información que alguien cargó.

5. **Deriva estructural cerrada** (migración 0179): los cuatro índices que 0095
   y 0096 dropean y staging nunca ejecutó, los cinco objetos con dos nombres
   distintos para la misma regla, y las tres guardas que staging tenía y el repo
   no declaraba. Estas últimas se CREARON donde faltaban en vez de borrarse
   donde estaban: bajar una guarda correcta para que dos bases coincidan es
   igualar para abajo.

**Pendiente:**

6. **Unificar el intake al autocomplete de localidad.** Medido: NO es un problema
   de integridad — el intake ya normaliza la jurisdicción de la mascota con
   `localityId` resuelto, y el campo libre (`rescue_jurisdiction`) no lo compara
   nadie, sólo se exporta a una columna de CSV. Queda como unificación de UX.
7. **Correr `check-env-schema-drift.ts` cuando exista otro entorno.** Producción
   hoy no existe (PO, 2026-08-13): staging manda y se levantará de cero. Cuando
   eso pase, comparar el entorno nuevo contra un local recién bootstrapeado
   responde en un comando la pregunta que hoy nadie podía responder — ¿nació
   igual a lo que dice el repo?

Las constraints entraron sobre datos que ya estaban limpios: sin migración de
datos y sin riesgo. Ese es justo el momento de ponerlas — una constraint es
barata mientras nadie la violó todavía.
