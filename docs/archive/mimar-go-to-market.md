# MiMAR — Go-to-market memo

*Strategy analysis: how to land MiMAR inside the Mi Argentina ecosystem.*

---

## TL;DR

1. **Mi Argentina does not host third-party apps.** It hosts **digital credentials** issued by other state organisms and shown via OAuth. The path "be inside Mi Argentina" actually means "have a credential issued by an authority that Mi Argentina has signed a convenio with."
2. **The federal gap is real and named.** SENASA approved the *Libreta Sanitaria Única Canina y Felina (LSUCyF)* in August 2022 — but only on paper. There is no digital version. A private competitor (VetCard) is already moving into that gap. The window is open but closing.
3. **There are three viable integration models**, with very different cost/speed trade-offs. The fastest win is **not** going federal first.
4. **The buyer is not one person — it's a triangle**: SENASA (issues the credential), the Colegio Veterinario federation (FeVA, issues the libretas in practice), and Innovación / Servicios Digitales (puts it in Mi Argentina). The political sponsor is whichever governor pilots it first.
5. **The fastest path to traction**: pilot at provincial level (Mendoza or Buenos Aires province) with one veterinary college + one health ministry. Show metrics. Use that as leverage to talk to the national triangle. Skip the federal sales loop until you have a working province behind you.

---

## What Mi Argentina actually is

Mi Argentina is the national citizen-identity platform under **Jefatura de Gabinete de Ministros → Secretaría de Innovación, Ciencia y Tecnología → Subsecretaría de Tecnologías de la Información y las Comunicaciones → Dirección Nacional de Servicios Digitales**. As of late 2023 it had 21M+ registered users.

### Architectural fact that changes everything

From the official integration docs (argob.github.io/mi-argentina-docs) and the renewal announcement: *"El administrador no almacena información de otros organismos ni credenciales digitales en su propia base de datos, y sólo exhibe credenciales digitales emitidas y homologadas por distintos organismos."*

In plain English: Mi Argentina is an OAuth 2.0 identity provider plus a credential viewer. It doesn't host apps. It shows credentials that **other state bodies have already issued**, after a formal convenio is signed. Each credential displayed in Mi Argentina has a homologating organism behind it (DNI ← Renaper, licencia ← ANSV, vehicular docs ← DNRPA, vacunas ← Ministerio de Salud, etc.).

This means MiMAR can plug in three ways:

### Option A — Credential model (most "official", slowest, highest legitimacy)
The *Libreta Sanitaria Digital de Mascota* becomes an officially issued credential, homologated by SENASA (or a delegated authority), and displayed inside Mi Argentina the way the licencia de conducir or the certificado de vacunación COVID-19 was.

- **Pro:** maximum legitimacy. The credential is THE credential. You become the de facto standard.
- **Pro:** distribution problem solved — 21M users open Mi Argentina already.
- **Con:** requires a convenio with SENASA + a regulatory act giving the libreta digital legal equivalence to the paper LSUCyF.
- **Con:** 12-24 month timeline minimum, and depends on national political will.
- **What "you" build:** the issuer system (used by vets), the credential schema, the OAuth integration, AND the citizen app where users *also* see their pet's full life history (which Mi Argentina won't show — it only shows the credential).

### Option B — "Iniciar sesión con Mi Argentina" model (medium effort, medium reward)
MiMAR is a standalone app. Users sign in with Mi Argentina via OAuth (standard, well-documented). The app reads the citizen's identity from Mi Argentina, but the pet data lives in MiMAR. No convenio needed for the OAuth integration — only to deepen with credentials later.

- **Pro:** fastest "looks official" win. The "Iniciar sesión con Mi Argentina" button is a legitimacy stamp.
- **Pro:** technically straightforward (request client ID + secret via GDE).
- **Con:** you're a standalone app with a federation login. Not "inside" Mi Argentina. User acquisition is on you.
- **Con:** no regulatory moat. A competitor can do exactly the same thing.

### Option C — Provincial pilot, then federal credential (recommended path)
Start at the province level. Sign with one provincial Colegio de Médicos Veterinarios + provincial Ministry of Health. The libreta is issued under provincial authority; MiMAR is the official app of that province's pet registry. Run for 6-12 months, collect metrics (X libretas digitalized, Y vets onboarded, Z compliance increase). Use that as the case study to go federal.

- **Pro:** decision-maker is one governor or one provincial health minister, not three federal organisms.
- **Pro:** you get a moat (provincial monopoly) and case-study leverage for the federal sale.
- **Pro:** the federal Mi Argentina integration becomes a *consequence* of provincial success, not a *prerequisite* for it.
- **Con:** province-by-province scale is slower than a national rollout.
- **Risk:** another province / private competitor could do the same play in parallel.

**Recommendation: Option C, then converge on Option A nationally.** Option B is a fallback if no province bites.

---

## The selling points, ranked by what authorities actually care about

Argentine state buyers — federal or provincial — respond to four motivators. Order matters: the first one opens the door, the rest justify the budget.

### 1. Rabies compliance and public-health risk reduction *(opens any door)*
Argentina has free annual rabies vaccination campaigns run by SENASA. **Less than 50% of owners comply on time** (this is in the public record around VetCard's launch coverage). Rabies is the only mandatory pet vaccine in Argentina and a public-health issue, not a pet-welfare nicety. A digital libreta with proactive reminders, geolocated campaign integration, and chip-linked verification is the single highest-impact intervention available to a Minister of Health.

> **The line:** "MiMAR raises antirrábica compliance from under 50% to over 80% in 18 months, at zero cost to the citizen." Numbers are testable — you can pre-commit to a metric.

### 2. Animal-welfare law modernization *(matches the cultural moment)*
The legal framing in Argentina is moving from *"dueño"* (owner of property) to *"tutor"* (guardian of a sentient being). Multiple provinces have or are debating *tenencia responsable* legislation. MiMAR is the operational tool that makes "tutor" a real legal-administrative role instead of a vibe.

> **The line:** "The law already calls them tutores. MiMAR is the registry that makes that real."

### 3. Identity / chip / lost-pet recovery *(headline-friendly)*
Once libretas are digital, the microchip database becomes nationally searchable. Lost pets, dangerous-dog incidents, abandonment patterns — all become operationally tractable. This is the photogenic angle: "Argentina recupera 10.000 mascotas perdidas con MiMAR" is the kind of headline that wins governors second terms.

### 4. Veterinary professional dignity *(the constituency that closes the deal)*
The Colegios de Médicos Veterinarios are the actual issuers of the libreta. They have political weight. A digital libreta they control (vs. one a private company controls) **protects their professional monopoly**. Pitching the FeVA (Federación Veterinaria Argentina) and provincial colegios as partners — not as users — turns them from gatekeepers into champions.

> **The line:** "VetCard is built around vets. MiMAR is built *with* vets."

### What NOT to lead with
- Tech sophistication (blockchain, AI, etc.) — the state buyer's IT team has heard the pitch a thousand times and will discount it.
- Citizen experience / app design — this is your real differentiator but it's table-stakes to the state. Save it for the demo.
- Cost savings — state buyers don't optimize for cost in citizen-facing apps the way enterprises do. They optimize for political wins and compliance metrics.

---

## The map of decision-makers

### National level (Mi Argentina integration)

| Layer | Body | Role | Current head |
| ----- | ---- | ---- | ------------ |
| Political | Jefatura de Gabinete → Innovación, Ciencia y Tecnología | Decides which credentials enter Mi Argentina | **Lic. Darío Leandro Genua** (Secretario) |
| Operational | Subsecretaría de Tecnologías de la Información y las Comunicaciones (SSTIC) | Owns Mi Argentina | Subsecretario (post under SICYT) |
| ONTI | Oficina Nacional de Tecnologías de Información | Approves tech architecture of new integrations | **Abg. Emiliano Villa** |
| Build team | Dirección Nacional de Servicios Digitales → Dirección de Desarrollo de Aplicaciones | Actually integrates new credentials into the app | **Ing. Constanza Irene Viere** |

> **Insight:** the technical insertion point for "I want my credential to appear in Mi Argentina" is the Dirección Nacional de Servicios Digitales, escalated through ONTI for approval, with political cover from the Secretaría. Don't start at Genua's level — start with Servicios Digitales and let them champion the project upward.

### Federal pet-regulation layer (the issuer / credential authority)

| Body | Role | Current head |
| ---- | ---- | ------------ |
| **SENASA** (Servicio Nacional de Sanidad y Calidad Agroalimentaria) | Approved LSUCyF as the official paper libreta. Owns mascotas.senasa.gob.ar (currently only CVI/international travel). Reports up to Ministerio de Economía → Secretaría de Bioeconomía. | (Verify current Presidente — changes with administration) |
| **Protenencia** (Ministerio de Salud) | National program for *tenencia responsable*, castrations, anti-maltrato. Operates on the ground via municipios. | **Dr. Juan Enrique Romero** (Coordinador Nacional) |
| **FeVA** (Federación Veterinaria Argentina) | Federation of provincial Colegios de Médicos Veterinarios. The libreta is physically issued by their matriculados. Political weight + technical credibility. | Federation presidency rotates |

> **Insight:** if you want a federal credential, **SENASA + FeVA is the partnership** — SENASA gives it sanitary legitimacy, FeVA gives it professional buy-in. Protenencia is a softer angle (welfare narrative, Ministerio de Salud framing) that helps the political pitch but doesn't issue anything.

### Provincial pilot candidates (where Option C plays out)

The provinces with the most digital-government appetite and existing pet-policy infrastructure:

- **Mendoza** — strong digital-government track record, already pet-active (A la Cucha was born there), Colegio Veterinario is well organized. Tech-friendly governor's office historically.
- **Buenos Aires (province)** — biggest population, biggest political prize, but also slowest to move.
- **Córdoba** — already has "Huella Animal" for dangerous dogs registration; you'd extend, not displace.
- **CABA** — smallest population but most concentrated buying authority. Secretaría de Transformación Digital is sophisticated.

> **Recommendation:** **Mendoza first.** Smaller political surface area, existing pet-tech narrative, easier to get a meeting, and the case study is portable. CABA second if Mendoza doesn't bite. Buenos Aires province is only worth pursuing if you have a direct line to the governor's office.

---

## If you knew the right person — the fastest path

There are four "right person" archetypes. Each unlocks a different fast path.

### If you know someone at SENASA → Option A direct
Specifically: someone in the **Dirección Nacional de Sanidad Animal** or the **Presidencia de SENASA**. The conversation is: *"You approved the LSUCyF in 2022 on paper. Let us digitize it as a credential. We'll build the issuer tool the vets use, the citizen app, and the Mi Argentina integration. You keep the regulatory authority."* Timeline to MVP credential: 9-15 months. **This is the highest-legitimacy path.**

### If you know someone at FeVA or a provincial Colegio → professional buy-in first
The pitch is: *"VetCard is a private company that's going to capture the digital libreta market. The day they do, the vets become their data tenants. Let's build the alternative where the Colegios own the system."* This converts vets from gatekeepers to active sponsors. Without them, the credential is paper-only and you have no issuance channel.

### If you know a governor, vice-governor, or provincial Health/Innovation minister → Option C fastest
The pitch is: *"For [X million pesos] and one ministerial signature, your province launches the first digital pet libreta in Argentina. We deliver in 6 months. You get the press, the compliance metrics, and the case study to take to the federal government."* This is the **single fastest path to a launched product**.

### If you know someone in Servicios Digitales / ONTI / SICYT → Mi Argentina integration de-risked
The pitch is: *"We have [SENASA / Province X / FeVA] sponsoring this credential. We need the OAuth client and the convenio template to put it in Mi Argentina."* This person can't *sponsor* MiMAR — but they can move the integration from "12 months of paperwork" to "8 weeks of paperwork." Tactical, not strategic.

**Force-rank by leverage**: Governor / Provincial minister > SENASA leadership > FeVA / Colegio president > Servicios Digitales contact.

---

## The 90-day playbook

If you want a concrete sequence to actually do this:

**Weeks 1-3 — Pick the pilot.** Talk to one Colegio de Médicos Veterinarios (Mendoza ideally) and one provincial health/innovation office in parallel. Don't talk to the federal level yet. You need a single "yes" from a province.

**Weeks 4-8 — Build the working prototype.** Not a deck. A working credential issuer + citizen app + working Mi Argentina OAuth login. Use the actual SENASA-approved LSUCyF data schema. Don't customize for the province yet — build the federal-ready version.

**Weeks 9-12 — Run the pilot meetings with the working app in hand.** Mendoza Ministerio de Salud, Colegio Veterinario, and the governor's innovation office. Demo, don't slide-pitch. Negotiate a 6-month pilot convenio with one Colegio.

**Months 4-9 — Pilot in production with one province.** Onboard ~50 vets, target 5,000 libretas issued. Publish monthly metrics openly.

**Month 10+ — Use the case study to talk to SENASA + FeVA + Servicios Digitales.** The federal conversation is now "We're already live in Mendoza. Want to put this in Mi Argentina?" — which is a much easier conversation than "Can we build something?"

---

## Risks worth naming

1. **VetCard or an equivalent commercial competitor lands a federal deal first.** They're already in the press. The longer the federal track takes, the higher this risk.
2. **An administration change between now and federal rollout.** Argentina's political cycles can erase 18 months of relationship-building overnight. The provincial pilot insulates against this — provinces survive national administration changes.
3. **The Colegios feel displaced and lobby against you.** Mitigation: enroll them as co-issuers from day one. The libreta they issue stays *their* libreta; MiMAR is the substrate.
4. **Mi Argentina UX team rejects the integration on legibility grounds.** This is real — they're protective of the app. Mitigation: the Mi Argentina-displayed credential should be minimal (chip ID, antirrábica status, libreta link). The rich UX lives in your standalone app.
5. **Privacy/data-residency concerns at the federal level.** Mitigation: pet data is low-stakes politically vs. health/identity data, but build with Argentine cloud (ARSAT) or local hosting from day one to defuse the objection before it's raised.

---

## Open questions to answer next

- Current SENASA president and their stated digital priorities.
- Whether VetCard has signed any provincial-government convenios already (search dgnos and provincial boletines).
- Current state of Mendoza's *Ley de Tenencia Responsable* (in force? in debate?).
- Whether Protenencia under the current Ministerio de Salud has budget allocated for digital tools — could become a federal funding source.
- Whether the *Ley de Bienestar Animal* national bill (debated in Congress in various forms) has any active draft that mentions a digital registry.

These can be researched in a second pass.

---

*Sources consulted: Mi Argentina official integration docs (argob.github.io), Boletín Oficial Resoluciones 156/2025 and 299/2025, argentina.gob.ar/miargentina, argentina.gob.ar/salud/protenencia, mascotas.senasa.gob.ar, Colegio de Médicos Veterinarios LSUCyF announcement (cmver.com.ar, 2022), VetCard launch coverage (Buenos Aires No Duerme, 2025).*
