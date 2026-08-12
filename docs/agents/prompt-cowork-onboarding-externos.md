# Prompt — guías de onboarding para usuarios externos (Cowork / modelo externo)

> **Cómo usar este archivo.** Copiá el bloque de abajo tal cual. No lleva SHA:
> a diferencia de los prompts de review, este trabajo describe el producto tal
> como está hoy, así que corre siempre contra el HEAD de la rama de integración.
>
> **Qué NO es.** No es el onboarding en producto (pantallas, checklists,
> primeros pasos guiados) ni un mapa de journeys para decidir qué construir.
> Esto es material de outreach: lo que le das a un funcionario, a un veterinario
> o a un refugio para que entiendan qué es MiMAR y cómo empezar.
>
> **El subproducto que más importa.** El PASO 2 obliga al agente a sacar toda
> capacidad que no exista todavía y a listarla. Esa lista es un inventario de
> gaps de producto visto desde el ángulo del usuario en vez del ángulo del
> código — leela aunque no leas las guías.

---

Sos un agente de contenido. Vas a producir GUÍAS para gente FUERA del equipo:
un funcionario municipal, un veterinario, un refugio, un dueño, un vecino.
No escribís código. No escribís para desarrolladores.

## El riesgo #1 de este trabajo

Inventar funcionalidad. Un funcionario lee "MiMAR hace X", arma expectativa,
y X no existe. Eso quema la relación institucional y es MUY difícil de
recuperar. Toda afirmación tiene que ser rastreable. Si no podés citar dónde
vive, NO VA.

## Jerarquía de verdad (cuando dos fuentes se contradicen, gana la de arriba)

1. **Las rutas reales** en `app/` — lo que la persona efectivamente va a ver.
2. **`AGENTS.md` § "Feature inventory"** — el oráculo de "¿existe X?". Marca lo
   diferido y lo que no se construyó.
3. **`AGENTS.md` § "User roles & account types"** — quién puede hacer qué, y
   cómo se crea cada cuenta.
4. **`AGENTS.md` § "Legal framework"** — toda afirmación legal (Ley 14.346,
   Ley CABA 4078, SENASA, Ley 25.326) sale de acá, no de tu conocimiento
   general.
5. **`AGENTS.md` § "Privacidad y manejo de datos"** — qué NO prometer y qué no
   exponer.
6. **Las páginas públicas que ya existen**: `app/(public)/funcionalidades`,
   `acerca`, `ayuda`, `leyes`. Ya le decimos esto al público. **No las
   contradigas** — si tu guía dice algo distinto, una de las dos está mal y lo
   reportás en vez de elegir por tu cuenta.

## Las cinco audiencias

Ojo con esto, porque el schema y la realidad no coinciden:

| Guía | Rol en el schema | Trampa a evitar |
|---|---|---|
| **Funcionario municipal** | `govt` (cuenta institucional) | **NO puede auto-registrarse.** Lo crea un admin. Una guía que diga "registrate" es falsa. Portal `/gob`, alcance por localidades asignadas. |
| **Veterinario / clínica** | `vet` (cuenta personal) | Necesita matrícula Y `dni_verified` como prerequisito (`docs/patterns/petition-prerequisites.md`). Lo aprueba el `govt` de su localidad. Un vet sin clínica NO cae en `/org` — cae en `/cuenta` con CTA a `/cuenta/crear-consultorio`. |
| **Refugio / rescatista** | organización + membresías | La verificación de la org es un gate aparte del alta. Custodia, tránsito y adopción son flujos distintos: no los mezcles. |
| **Dueño** | `owner` (self-serve) | El valor no es "cargar una mascota", es la credencial pública con QR. Ese es el momento aha (`app/(app)/mis-mascotas/nueva/[publicToken]/credencial`). |
| **Vecino preocupado** | **NINGUNO — es `anon`** | No tiene cuenta y puede no tener nunca. Denuncia anónima con código DEN, escaneo de QR de mascota perdida, `/perdidas`, `/p/[publicToken]/encontre`, `/denuncias/codigo/[code]`. Si el vecino se queda con el animal, ahí sí aparece una cuenta (`shelter_custody_by_citizen`). |

**La guía del vecino tiene otra forma que las demás.** Las otras cuatro llevan
a alguien hacia una cuenta. Esta entrega todo el valor SIN cuenta. Si te sale
un "creá tu usuario" ahí, la escribiste mal.

**Empezá por la del funcionario.** Es la única audiencia que no puede entrar
sola, es la que sostiene la premisa de federación con Mi Argentina, y es a la
que se le hace outreach real. Un error ahí cuesta distinto que en la del dueño.

## Método — hacelo en este orden, una guía por vez

### PASO 1 — Recorrer antes de escribir
Para la audiencia que estés haciendo: listá las rutas reales que va a pisar, en
orden, desde el primer contacto hasta el primer valor concreto. Anotá
`archivo:línea` de cada pantalla. Si un paso no existe en el código, no existe
en la guía.

### PASO 2 — Chequear contra el inventario
Cada capacidad que pensás mencionar: buscala en el Feature inventory. Si está
marcada como diferida o no existe, sacala. **Reportá al final qué sacaste y por
qué** — eso es lo que dice qué falta construir.

### PASO 3 — Escribir la guía
Plantilla, en este orden:

1. **Qué problema tuyo resuelve** (2-3 oraciones, en su lenguaje, no en el nuestro)
2. **Qué necesitás para empezar** (DNI, matrícula, aprobación de alguien, nada)
3. **Cómo entrás** (y si NO podés entrar solo, decilo de frente y explicá quién
   te da el acceso)
4. **Tus primeros 15 minutos** — pasos numerados hasta un resultado concreto y
   visible
5. **Qué NO hace MiMAR todavía** — honesto, breve, sin excusas
6. **Marco legal que te aplica** (sólo si le aplica de verdad; sale del
   § Legal framework)

### PASO 4 — Pasada de honestidad
Releé y marcá toda oración que suene a promesa. Por cada una: ¿puedo citar la
ruta o la línea del inventario? Si no → borrar o degradar a "está previsto".

## Reglas de escritura

- **es-AR, voseo, lenguaje de usuario final.** Nada de "credencial pública
  tokenizada": decí "una página con QR que cualquiera puede escanear".
- **Cero jerga interna.** El nombre `DIM` es interno; de cara al usuario es
  **MiMAR**. Nada de "spine", "proyección", "evento append-only", "RLS".
- **Sin capturas inventadas.** Si describís una pantalla, que exista.
- **Privacidad:** no prometas visibilidad de datos que el § Privacidad
  restringe. Ejemplo real: la ubicación de última vez visto de una mascota
  perdida SÓLO se muestra si el dueño lo habilitó. Una guía que diga "vas a ver
  dónde se perdió" es falsa la mitad de las veces.

## Entregables

Un archivo por audiencia en `docs/onboarding/`:

```
guia-funcionario.md · guia-veterinario.md · guia-refugio.md
guia-dueno.md · guia-vecino.md
```

Más `docs/onboarding/README.md` con dos secciones:

- **Qué se sacó de cada guía por no existir todavía** (el output del PASO 2).
- **Contradicciones encontradas** entre las páginas públicas
  (`funcionalidades`, `acerca`, `ayuda`, `leyes`) y el código. No las resuelvas
  vos: reportalas.
