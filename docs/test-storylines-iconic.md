# Iconic-Pet Storylines — Workflow Test Fixtures

> Source bios: `docs/archive/historia otras mascotas.txt` (Laika, Hachikō, Lassie, Toto, Kabosu).
>
> Decisions applied per user direction:
> - **Locations:** relocated to Argentina (Moscow → CABA/Bariloche/Falda del Carmen, Tokyo → CABA/Estación Retiro, Hollywood → Saavedra/Tandil, Sakura → Belgrano R).
> - **Franchise pets:** one canonical real dog per role — **Pal** for Lassie, **Terry** for Toto. No successor records under the same franchise.
> - **Death + replacement:** every death runs the full disposition cycle per Ley CABA 5470. Replacement-pet registration is applied **only where canon supports it** — Hachikō (→ Hachiko Ni Sei to Yaeko Ueno) and Kabosu (→ Hanako to Atsuko Sato). **No replacement** for Laika or for the franchise dogs.
> - **Microchips:** none of these five pets had microchips in their real timeline — 1957/1925/1940/1933 predate the technology. Kabosu (2005–) is the only chip-eligible one. This batch is the dataset's "no-chip" testbed.
> - **Title numbers (7/6/7/5):** ignored — no semantic meaning.
>
> Pet list:
>
> 1. **Laika** — *dog, mestiza tipo husky/spitz, female* — Liniers CABA → Bariloche → Falda del Carmen (Centro Espacial T. Tabanera). Dies on Sputnik 2 (1957-11-03). **No replacement.**
> 2. **Hachikō** — *dog, Akita, male* — Caballito CABA / Estación Retiro. Dies 1935-03-08 of cardio-filariosis. **Replacement: Hachiko Ni Sei** to Yaeko Ueno.
> 3. **Pal (Lassie)** — *dog, Rough Collie, male* — Tandil estancia → Saavedra (estudios Argentina Sono Film). Dies 1958-06-18 of cardiac disease. **No replacement** (franchise).
> 4. **Terry (Toto)** — *dog, Cairn Terrier, female* — Olivos → Saavedra studios. Dies 1945-09-01 of natural causes. **No replacement** (franchise).
> 5. **Kabosu** — *dog, Shiba Inu, female* — Salta puppy mill rescue → Belgrano R, CABA. Dies 2024-05-24 of leukemia + liver disease. **Replacement: Hanako** to Atsuko Sato.

---

## 1. Laika  ·  `dog`  ·  Mestiza tipo husky/spitz  ·  Female

- **Aliases (chronological):** Kudryavka → Zhuchka → Limónchik → **Laika**
- **Breed:** Mestiza (fenotipo husky/spitz)
- **Color/coat:** Blanco y gris, pelaje denso
- **DOB (estimated):** 1954-09-15
- **Owner of record:** Vladimir Yazdovsky (jefe de programa, INVAP-Bariloche)
- **Microchip:** None (predates technology; permanently absent)
- **Public token (test):** `DIM-LAIK-0015`
- **Estimated weight:** 6.0 kg
- **Known allergies:** Ninguna documentada
- **PPP:** false
- **Jurisdiction:** AR / Ciudad Autónoma de Buenos Aires / Liniers (intake) → AR / Río Negro / Bariloche (training) → AR / Córdoba / Falda del Carmen (launch)
- **Status:** `deceased`
- **Acquisition:** `rescued`
- **Notable:** Test fixture for: extreme `location_description` on `status_changed → lost` (literal Earth orbit), `disposition_method='unknown'` (no body recoverable), no-replacement rule, posthumous notes appended decades later, and `outbreak_signal` matching against a long-deceased pet.

| # | Date | Event | Location | Details |
|---|------|-------|----------|---------|
| 1 | 1957-03-20 | `shelter_intake_recorded` ⚑ | Liniers, CABA | "Refugio Patitas Federales". `intake_reason='stray_found'`, `intake_condition='emaciated'`. Found wandering Av. General Paz / Av. Rivadavia. |
| 2 | 1957-03-20 | `pet_registered` | Liniers, CABA | Name: **Kudryavka** ("Cachorrita"). `acquisition_method='rescued'`. |
| 3 | 1957-03-22 | `vet_visit_logged` | Liniers, CABA | Intake exam. BCS 2/9. |
| 4 | 1957-03-25 | `deworming_administered` | Liniers, CABA | Standard. |
| 5 | 1957-04-01 | `weight_recorded` | Liniers, CABA | 5.4 kg. |
| 6 | 1957-04-08 | `vaccination_administered` | Liniers, CABA | Antirrábica. |
| 7 | 1957-04-20 | `custody_transfer_proposed` ⚑ | Liniers, CABA | Refugio → INVAP Bariloche para programa espacial. Two-phase. |
| 8 | 1957-04-25 | `custody_transferred` ⚑ | Bariloche, Río Negro | `from_organization_id=Refugio Patitas Federales`, `to_user_id=V. Yazdovsky`. Custodia con propósito declarado: investigación aeroespacial. |
| 9 | 1957-04-26 | `pet_profile_updated` ⚑ | Bariloche | `changes=[{field:'name', old:'Kudryavka', new:'Zhuchka'}]`. |
| 10 | 1957-05-10 | `pet_profile_updated` ⚑ | Bariloche | Name → **Limónchik**. |
| 11 | 1957-05-22 | `pet_profile_updated` ⚑ | Bariloche | Name → **Laika**. Final canonical name. |
| 12 | 1957-06-01 | `clinical_info_logged` | Bariloche | `sub_kind='other'`. Baseline cardiopulmonar pre-entrenamiento. |
| 13 | 1957-06-15 | `clinical_info_logged` ⚑ | Bariloche | `sub_kind='lab_work'`. Bioquímica basal: CK elevada por estrés muscular. |
| 14 | 1957-06-22 | `symptom_observed` | Bariloche | Taquicardia post-sesión de centrífuga. |
| 15 | 1957-07-04 | `symptom_observed` ⚑ | Bariloche | Conductas compulsivas (caminata circular en jaula). |
| 16 | 1957-07-15 | `medication_started` | Bariloche | Sedante leve previo a entrenamiento. |
| 17 | 1957-07-20 | `weight_recorded` | Bariloche | 5.7 kg. |
| 18 | 1957-08-04 | `maltreatment_reported` ⚑ | Bariloche | `kind='confinamiento prolongado en cápsula de entrenamiento'`, severity=alta. Reported internally by lab vet; ascended to refugio of origin. Documented but no remediation. |
| 19 | 1957-08-15 | `note_added` ⚑ | Bariloche | *"Laika es excepcionalmente dócil. Eso la condena."* — V. Yazdovsky. `category='observación interna'`. |
| 20 | 1957-08-22 | `incident_reported` | Bariloche | `incident_type='other'`. Síncope durante simulación de aceleración 7G. |
| 21 | 1957-09-01 | `medication_stopped` | Bariloche | Sedante suspendido — interfería con respuestas medibles. |
| 22 | 1957-09-15 | `clinical_info_logged` | Bariloche | `sub_kind='imaging'`. Rx torácica pre-vuelo. |
| 23 | 1957-09-30 | `vet_visit_logged` | Bariloche | Pre-mission completo. |
| 24 | 1957-10-10 | `pet_profile_updated` | Bariloche | Foto oficial cargada (la imagen icónica con casco). |
| 25 | 1957-10-15 | `weight_recorded` | Bariloche | 6.0 kg. |
| 26 | 1957-10-20 | `note_added` ⚑ | Bariloche | Yazdovsky lleva a Laika a su casa, la presenta a sus hijos. *"Quería darle algo bueno antes."* `category='trivia'`. |
| 27 | 1957-10-28 | `vaccination_administered` | Bariloche | Recordatorio antirrábico. |
| 28 | 1957-11-01 | `clinical_info_logged` ⚑ | Falda del Carmen, Córdoba | `sub_kind='other'`. "Briefing pre-órbita". Documentación interna admite que la misión no contempla reentrada segura. |
| 29 | 1957-11-02 | `note_added` ⚑ | Falda del Carmen | *"Pedí perdón. Le pedí perdón."* — Yazdovsky (declaración póstuma, registrada años después en este timestamp). `category='posthumous_intercalated'`. |
| 30 | 1957-11-03 | `status_changed` ⚑ | Órbita terrestre baja | `to_status='lost'`. `location_description='órbita terrestre baja, Sputnik 2'`, `reason='lanzamiento espacial'`. **Edge case:** test del campo `location_description` con un valor extra-planetario. |
| 31 | 1957-11-03 | `incident_reported` ⚑ | Centro Espacial Teófilo Tabanera, Falda del Carmen | `incident_type='other'`, `severity='fatal'`. Lanzamiento Sputnik 2. |
| 32 | 1957-11-03 | `symptom_observed` ⚑ | Órbita | Telemetría: taquicardia extrema, ~240 bpm 1h post-lanzamiento. |
| 33 | 1957-11-03 | `symptom_observed` ⚑ | Órbita | Falla del control térmico; temperatura interna >40 °C. |
| 34 | 1957-11-03 | `death_recorded` ⚑ | Órbita (Sputnik 2) | `cause='other'`, `cause_detail='sobrecalentamiento por falla térmica del compartimento orbital'`, `confirmed_by_vet=false`, `vet_name=null`, `disposition_method='unknown'`, `facility='Sputnik 2 (incinerado al reingreso atmosférico, 1958-04-14)'`, `death_at_clinic=false`, `vet_contacted_owner='not_applicable'`, `is_reportable=true`. Hora estimada: 5–7 h post-lanzamiento. |
| 35 | 1957-11-04 | `note_added` ⚑ | Bariloche | *Comunicado oficial:* "Laika sobrevivió 7 días en órbita en condiciones normales." `category='comunicado_oficial'`. **Reconocido como falso 45 años después.** |
| 36 | 1957-11-04 | `pet_profile_updated` | Bariloche | `status='deceased'` snapshot. |
| 37 | 1958-04-14 | `incident_reported` | Atmósfera terrestre | `incident_type='other'`. Reingreso y desintegración de Sputnik 2 con restos de Laika a bordo. Closure record. |
| 38 | 1993-09-22 | `note_added` ⚑ | Falda del Carmen | Oleg Gazenko (científico) declara públicamente: *"Cuanto más tiempo pasa, más lo lamento."* Inserted retroactively as posthumous record. `author_role='admin'`, `category='posthumous'`. |
| 39 | 2008-04-11 | `note_added` ⚑ | Falda del Carmen | Monumento develado en Centro Tabanera. `category='posthumous_event'`. |
| 40 | 2014-11-03 | `libreta_shared_viewed` ⚑ | (telemetry) | Tier-2 share del historial completo por la viuda de Yazdovsky a un periodista escribiendo *Laika nunca volvió*. |
| 41 | 2017-11-03 | `note_added` | (posthumous) | 60° aniversario del lanzamiento. `category='aniversario'`. |
| 42 | 2022-05-15 | `outbreak_signal` ⚑ | (system) | Match retroactivo: taquicardia + estrés térmico → patrón `ZOO_TRAUMA_ORBITAL`. False positive sobre paciente fallecida hace 65 años; cerrado por admin. **Edge case:** outbreak signal on a long-deceased pet. |
| 43 | 2023-11-03 | `note_added` | (posthumous) | 66° aniversario. `category='aniversario'`. |

**Uncommon events tagged: 18**

> **No replacement registered.** Per user direction, Laika's record terminates at her death; the rule does not apply.

---

## 2. Hachikō  ·  `dog`  ·  Akita Inu  ·  Male

- **Breed:** Akita Inu
- **Color/coat:** Dorado con máscara blanca
- **DOB:** 1923-11-10
- **Owner of record:** Hidesaburō Ueno (profesor, UBA-Filo, Caballito) → after 1925, Kikuzaburō Kobayashi (jardinero)
- **Microchip:** None (predates technology)
- **Public token (test):** `DIM-HACH-0016`
- **Estimated weight:** 41 kg
- **Known allergies:** Ninguna
- **PPP:** false
- **Jurisdiction:** AR / Ciudad Autónoma de Buenos Aires / Caballito (home); event hotspot AR / CABA / Retiro (Estación Retiro)
- **Status:** `deceased`
- **Acquisition:** `gift` (from Tandil estancia)
- **Notable:** Test fixture for: same-day owner-death cascade onto pet record, `custody_dispute_raised → resolved`, 9-year recurring `status_changed → lost` / `credential_scanned` / `status_changed → active` loop at one fixed landmark, real `cause_of_death` combining cardiac filariosis with terminal cancer (per 2011 necropsy reinterpretation), and canon-friend replacement.

| # | Date | Event | Location | Details |
|---|------|-------|----------|---------|
| 1 | 1923-11-10 | `pet_registered` | Tandil, Buenos Aires | Born at Estancia La Rinconada (Tandil). `acquisition_method='bred'`. |
| 2 | 1924-01-14 | `custody_transferred` ⚑ | Caballito, CABA | Tandil estancia → Prof. H. Ueno (Caballito, Av. Pedro Goyena 1300). Composite intake to CABA. |
| 3 | 1924-01-15 | `vet_visit_logged` | Caballito | Intake exam. Healthy. |
| 4 | 1924-02-01 | `vaccination_administered` | Caballito | Moquillo + parvovirus (anachronistic baseline). |
| 5 | 1924-03-15 | `deworming_administered` | Caballito | Vermífugo. |
| 6 | 1924-05-22 | `note_added` ⚑ | Caballito | *"Hachikō acompaña al profesor cada mañana a Estación Retiro y vuelve a esperarlo cada tarde."* `category='rutina'`. |
| 7 | 1924-07-04 | `weight_recorded` | Caballito | 14 kg. |
| 8 | 1924-09-09 | `vaccination_administered` | Caballito | Anual. |
| 9 | 1925-02-15 | `weight_recorded` | Caballito | 28 kg. |
| 10 | 1925-05-21 | `incident_reported` ⚑ | UBA-Filo, Puan 480, Caballito | `incident_type='other'`, `severity='fatal_to_owner'`. **Ueno muere de hemorragia cerebral durante una clase.** Hachikō pierde a su dueño. |
| 11 | 1925-05-21 | `custody_dispute_raised` ⚑ | Caballito | Owner deceased; sucesión pendiente. `pets.in_custody_dispute=true`. Raised by `author_role='govt'`. |
| 12 | 1925-05-21 | `status_changed` ⚑ | Estación Retiro, CABA | `to_status='lost'`, `location_description='Estación Retiro, andén 1'`. Hachikō llega a la estación esa tarde, no encuentra a Ueno, no se mueve. |
| 13 | 1925-05-22 | `credential_scanned` | Estación Retiro | Scanned por **Jefe de estación** (medalla en collar). Identificado. |
| 14 | 1925-05-23 | `status_changed` | Caballito | → `active`. Returned a la Sra. Yaeko Ueno (viuda). |
| 15 | 1925-06-01 | `custody_transfer_proposed` ⚑ | Caballito | Yaeko Ueno propone transferir custodia al jardinero Kobayashi (no puede conservarlo por luto). |
| 16 | 1925-06-05 | `custody_transferred` | Boedo, CABA | Yaeko Ueno → K. Kobayashi (Av. Boedo 1500). |
| 17 | 1925-06-05 | `custody_dispute_resolved` ⚑ | Boedo | `outcome='ownership_transferred'`. Cierre del dispute. |
| 18 | 1925-06-15 | `status_changed` ⚑ | Estación Retiro | → `lost`. Hachikō escapa de Boedo y vuelve a la estación. **Primer ciclo de espera.** |
| 19 | 1925-06-15 | `credential_scanned` | Estación Retiro | Vendedor de diarios, **don Alfredo**, lo identifica. |
| 20 | 1925-06-16 | `status_changed` | Boedo | → `active`. Returned. |
| 21 | 1925-08-22 | `status_changed` | Estación Retiro | → `lost`. Segundo ciclo. |
| 22 | 1925-08-22 | `credential_scanned` | Estación Retiro | Pasajero habitual, **Sra. Mitsuko Tanaka**. |
| 23 | 1925-08-23 | `status_changed` | Boedo | → `active`. |
| 24 | 1926-03-15 | `vaccination_administered` | Boedo | Anual. |
| 25 | 1926-09-09 | `status_changed` ⚑ | Estación Retiro | → `lost`. Tercer ciclo. La gente comienza a reconocerlo. |
| 26 | 1926-09-10 | `credential_scanned` | Estación Retiro | Limpiabotas, **Carmelo Rossi**. |
| 27 | 1926-09-11 | `status_changed` | Boedo | → `active`. |
| 28 | 1927-04-22 | `weight_recorded` | Boedo | 38 kg. |
| 29 | 1927-08-08 | `vet_visit_logged` | Boedo | Wellness. |
| 30 | 1928-01-15 | `status_changed` | Estación Retiro | → `lost`. Cuarto ciclo registrado. |
| 31 | 1928-01-16 | `credential_scanned` | Estación Retiro | Boletera, **Sra. Esther Goldman**. |
| 32 | 1928-01-16 | `status_changed` | Boedo | → `active`. |
| 33 | 1929-03-15 | `vaccination_administered` | Boedo | Anual. |
| 34 | 1930-07-04 | `status_changed` ⚑ | Estación Retiro | → `lost`. Quinto ciclo. Kobayashi lo deja ir — entiende que el perro va y vuelve solo. |
| 35 | 1930-07-04 | `credential_scanned` | Estación Retiro | Auto-scan: el conductor del tren lo reconoce de vista. Pet is left at station; food brought by commuters. |
| 36 | 1930-07-05 | `status_changed` | Estación Retiro | → `active`. (Manualmente cerrado por Kobayashi; en realidad el perro vive entre la estación y el barrio.) |
| 37 | 1932-10-04 | `libreta_shared_viewed` ⚑ | (telemetry) | Tier-2 share del historial por Kobayashi al diario **La Nación**. La crónica *"El perro que espera en Retiro"* sale al día siguiente. |
| 38 | 1932-10-05 | `pet_profile_updated` ⚑ | Boedo | Foto oficial reemplazada por la imagen que tomó *La Nación*. |
| 39 | 1933-02-22 | `note_added` ⚑ | Estación Retiro | Placa conmemorativa instalada por Ferrocarriles. *"Aquí espera Hachikō."* `category='reconocimiento'`. |
| 40 | 1933-08-15 | `vaccination_administered` | Boedo | Anual. |
| 41 | 1934-04-22 | `note_added` ⚑ | Estación Retiro | Estatua de bronce inaugurada (con Hachikō presente). Escultor: Tora Andō, relocated as Tora Andó-Buenos Aires. `category='reconocimiento'`. |
| 42 | 1934-09-09 | `weight_recorded` | Boedo | 36 kg (pérdida — vejez). |
| 43 | 1934-11-30 | `symptom_observed` ⚑ | Boedo | Disnea moderada, tos seca crónica. |
| 44 | 1934-12-04 | `clinical_info_logged` ⚑ | Boedo | `sub_kind='lab_work'`. Microfilarias positivas en frotis. **Filariosis cardiaca (Dirofilaria immitis).** |
| 45 | 1934-12-10 | `clinical_info_logged` | Boedo | `sub_kind='imaging'`. Eco cardiaca — dilatación de cavidades derechas, hipertensión pulmonar. |
| 46 | 1934-12-15 | `medication_started` ⚑ | Boedo | Cuidado paliativo (no había tratamiento eficaz en 1934). |
| 47 | 1935-01-22 | `clinical_info_logged` ⚑ | Boedo | `sub_kind='other'`. Hallazgo incidental: masa pulmonar caudal derecha — neoplasia probable. Pronóstico reservado. |
| 48 | 1935-03-08 | `death_recorded` ⚑ | Estación Retiro | **Hachikō muere a las afueras de Estación Retiro.** `cause='disease'`, `cause_detail='falla cardíaca derecha por filariosis + cáncer pulmonar terminal'`, `confirmed_by_vet=true`, `vet_name='Dr. Tanaka'`, `disposition_method='authorized_cemetery'`, `facility='Cementerio de la Chacarita, sector animales (relocated from Aoyama Cemetery)'`, `death_at_clinic=false`, `is_reportable=false`. |
| 49 | 1935-03-09 | `note_added` ⚑ | Caballito | *"Hachikō, esperaste nueve años. Hoy te dejamos descansar a un costado de quien siempre miraste con esperanza. — K. Kobayashi"* `category='despedida'`. |
| 50 | 1935-03-15 | `pet_registered` ⚑ | Caballito | **NEW PET to Yaeko Ueno (original co-owner).** Name: **Hachiko Ni Sei** ("Hachikō II"). Akita Inu, male, regalado por la familia Tandil en memoria. See storyline §2b. |

**Uncommon events tagged: 20**

### §2b. Hachiko Ni Sei — Replacement registered to Yaeko Ueno

- **Species:** `dog`, **Akita Inu**, male
- **Owner:** Yaeko Ueno (Caballito).
- **Microchip:** None (still 1935).
- **Public token:** `DIM-HCN2-0016B`

| # | Date | Event | Location | Details |
|---|------|-------|----------|---------|
| 1 | 1935-03-15 | `pet_registered` | Caballito | `acquisition_method='gift'`. From same Tandil estancia. |
| 2 | 1935-04-01 | `vet_visit_logged` | Caballito | Intake. |
| 3 | 1935-04-15 | `vaccination_administered` | Caballito | Moquillo. |
| 4 | 1935-09-09 | `weight_recorded` | Caballito | 18 kg (cachorro). |
| 5 | 1936-03-22 | `vaccination_administered` | Caballito | Anual. |
| 6 | 1936-08-15 | `vet_visit_logged` | Caballito | Wellness. |
| 7 | 1937-04-04 | `note_added` | Estación Retiro | *"Hachiko II viene a la estación cada tanto, pero vuelve solo."* — Yaeko Ueno. `category='rutina'`. |

---

## 3. Pal ("Lassie")  ·  `dog`  ·  Rough Collie  ·  Male

- **Breed:** Rough Collie
- **Color/coat:** Sable y blanco
- **DOB:** 1940-06-04
- **Owner of record:** Howard Peck (original, Tandil) → **Rudd Weatherwax** (1942-09 onward, Saavedra CABA)
- **Microchip:** None (predates technology)
- **Public token (test):** `DIM-PAL2-0017`
- **Estimated weight:** 28 kg
- **Known allergies:** Ninguna documentada
- **PPP:** false
- **Jurisdiction:** AR / Buenos Aires / Tandil (origin) → AR / Ciudad Autónoma de Buenos Aires / Saavedra (career)
- **Status:** `deceased`
- **Acquisition:** `purchased`
- **Notable:** Test fixture for: behavioral-history-driven ownership transfer (`adoption_revoked` then `custody_transferred` to trainer), repeated `incident_reported(bite_inflicted)` with the rabies-observation pair, training milestones logged as `note_added`, and a long career-to-retirement arc.

| # | Date | Event | Location | Details |
|---|------|-------|----------|---------|
| 1 | 1940-06-04 | `pet_registered` | Tandil, BA Province | Born at Estancia Los Eucaliptos. `acquisition_method='bred'`. |
| 2 | 1940-08-22 | `custody_transferred` | Tandil → CABA | Vendido a Howard Peck, San Telmo, CABA. |
| 3 | 1940-09-15 | `vaccination_administered` | San Telmo | Moquillo. |
| 4 | 1941-02-14 | `incident_reported` ⚑ | San Telmo | `incident_type='bite_inflicted'`. Mordió al carnicero del barrio (provocación: lo persiguió primero). |
| 5 | 1941-02-14 | `rabies_observation_started` ⚑ | San Telmo | 10-day legal period. `pets.rabies_observation_status='in_progress'`. |
| 6 | 1941-02-24 | `rabies_observation_ended` ⚑ | San Telmo | Sin signos. Cierre. |
| 7 | 1941-05-22 | `incident_reported` ⚑ | Av. San Juan, San Telmo | `incident_type='bite_suffered'`. Persiguió una moto y se llevó por delante un colectivo línea 39. Sin fracturas; magulladuras. |
| 8 | 1941-09-09 | `note_added` ⚑ | San Telmo | *"Pal persigue motos. Inentrenable por la familia."* `category='conducta'`. |
| 9 | 1942-03-15 | `adoption_revoked` ⚑ | San Telmo | Howard Peck devuelve el perro por imposibilidad de manejo. (Reusing `adoption_revoked` even though this isn't an org-driven case — treat as voluntary surrender that re-opens custody.) |
| 10 | 1942-03-20 | `shelter_intake_recorded` | Saavedra | Recibido por la escuela canina de Rudd Weatherwax (relocated to Saavedra, Av. Crisólogo Larralde 4500). |
| 11 | 1942-04-01 | `custody_transferred` ⚑ | Saavedra | Shelter custody → Weatherwax (owner). |
| 12 | 1942-04-15 | `note_added` ⚑ | Saavedra | *"Pal aprende todo en 20 minutos. Lo único difícil es que pare."* — R. Weatherwax. `category='entrenamiento'`. |
| 13 | 1942-07-04 | `vaccination_administered` | Saavedra | Anual. |
| 14 | 1942-09-30 | `weight_recorded` | Saavedra | 27 kg. |
| 15 | 1943-01-15 | `note_added` ⚑ | Argentina Sono Film, Saavedra | Audition para film *Lassie Vuelve a Casa* (versión argentina). Seleccionado. `category='hito_profesional'`. |
| 16 | 1943-04-22 | `clinical_info_logged` | Saavedra | `sub_kind='other'`. Examen pre-filmación: apto. |
| 17 | 1943-09-09 | `note_added` | Saavedra | Estreno de *Lassie Vuelve a Casa*. `category='hito_profesional'`. |
| 18 | 1944-02-14 | `vaccination_administered` | Saavedra | Anual. |
| 19 | 1944-06-22 | `incident_reported` | Saavedra | `incident_type='fall'`. Caída de pedestal durante escena. Sin lesiones graves. |
| 20 | 1944-09-09 | `note_added` | Saavedra | Inicio rodaje *Hijo de Lassie*. `category='hito_profesional'`. |
| 21 | 1945-03-15 | `vet_visit_logged` | Saavedra | Wellness anual. |
| 22 | 1945-08-08 | `weight_recorded` | Saavedra | 28 kg. |
| 23 | 1946-04-22 | `note_added` | Saavedra | Rodaje *Coraje de Lassie*. `category='hito_profesional'`. |
| 24 | 1946-09-09 | `vaccination_administered` | Saavedra | Anual. |
| 25 | 1947-05-30 | `note_added` ⚑ | Saavedra | *"Pal aparece en portadas. La gente lo reconoce en la calle. Le pedimos paciencia."* — Weatherwax. `category='trivia'`. |
| 26 | 1947-12-04 | `vet_visit_logged` | Saavedra | Pre-rodaje. |
| 27 | 1948-03-22 | `note_added` | Saavedra | Rodaje *Hills of Home*. `category='hito_profesional'`. |
| 28 | 1948-09-09 | `vaccination_administered` | Saavedra | Anual. |
| 29 | 1949-04-04 | `weight_recorded` | Saavedra | 29 kg. |
| 30 | 1949-08-22 | `note_added` | Saavedra | Rodaje *The Sun Comes Up*. |
| 31 | 1950-02-14 | `clinical_info_logged` ⚑ | Saavedra | `sub_kind='imaging'`. Rx columna — discopatía cervical incipiente. |
| 32 | 1950-04-22 | `medication_started` | Saavedra | Antiinflamatorio. |
| 33 | 1950-09-09 | `vaccination_administered` | Saavedra | Anual. |
| 34 | 1951-03-30 | `medication_stopped` | Saavedra | Pausa terapéutica. |
| 35 | 1951-09-15 | `note_added` | Saavedra | Última película de Pal: *Painted Hills*. `category='hito_profesional'`. |
| 36 | 1952-04-22 | `status_changed` ⚑ | Costanera Sur, CABA | → `lost`. Escapa durante rodaje al aire libre. |
| 37 | 1952-04-23 | `credential_scanned` | Costanera Sur | Identificado por un guardaparque, **Don Vicente**. Returned. |
| 38 | 1952-04-23 | `status_changed` | Saavedra | → `active`. |
| 39 | 1952-09-09 | `vaccination_administered` | Saavedra | Anual. |
| 40 | 1953-04-04 | `note_added` ⚑ | Saavedra | Retiro profesional. Weatherwax cierra contrato con el estudio. `category='retiro'`. |
| 41 | 1954-02-22 | `weight_recorded` | Saavedra | 26 kg (pérdida — vejez). |
| 42 | 1954-09-09 | `vaccination_administered` | Saavedra | Anual. |
| 43 | 1955-06-22 | `symptom_observed` ⚑ | Saavedra | Disnea de esfuerzo creciente. |
| 44 | 1955-07-04 | `clinical_info_logged` | Saavedra | `sub_kind='imaging'`. Cardiomegalia, derrame pleural leve. |
| 45 | 1955-07-15 | `medication_started` | Saavedra | Digital + diurético (terapéutica de época). |
| 46 | 1956-08-08 | `vet_visit_logged` | Saavedra | Geriatric exam. |
| 47 | 1957-03-22 | `clinical_info_logged` ⚑ | Saavedra | `sub_kind='lab_work'`. Función renal deteriorada. |
| 48 | 1957-09-30 | `vet_visit_logged` | Saavedra | Quality of life check. |
| 49 | 1958-04-15 | `medication_stopped` | Saavedra | Suspensión gradual — quality-of-life. |
| 50 | 1958-06-18 | `death_recorded` ⚑ | Saavedra | `cause='disease'`, `cause_detail='insuficiencia cardiaca congestiva + fallo renal crónico'`, `confirmed_by_vet=true`, `vet_name='Dr. Mendoza'`, `disposition_method='owner_burial'`, `facility='Quinta Weatherwax, Saavedra'`, `death_at_clinic=false`, `is_reportable=false`. |
| 51 | 1958-06-19 | `note_added` ⚑ | Saavedra | *"Pal: enseñaste a Rin Tin Tin a no hacer trampa. Y a mí a quedarme quieto cuando hace falta. — R. Weatherwax."* `category='despedida'`. |

**Uncommon events tagged: 14**

> **No replacement registered.** Franchise rule — the Lassie role was canonically continued by Pal's own pups (Lassie Junior, Spook, Baby), but the user said to skip the franchise complication.

---

## 4. Terry ("Toto")  ·  `dog`  ·  Cairn Terrier  ·  Female

- **Breed:** Cairn Terrier
- **Color/coat:** Brindle
- **DOB:** 1933-11-17
- **Owner of record:** Familia abandonante (1933-12) → **Carlos "Carl" Spitz** (1934-02 onward, Olivos)
- **Microchip:** None
- **Public token (test):** `DIM-TRRY-0018`
- **Estimated weight:** 7.0 kg
- **Known allergies:** Ninguna documentada
- **PPP:** false
- **Jurisdiction:** AR / Buenos Aires Province / Vicente López / Olivos (training); AR / CABA / Saavedra (studio work)
- **Status:** `deceased`
- **Acquisition:** `rescued`
- **Notable:** Test fixture for: abandonment-by-housing-issue → shelter → adoption arc, on-set injury cycle, name change (Terry → registered stage name "Toto"), and a real natural-causes death.

| # | Date | Event | Location | Details |
|---|------|-------|----------|---------|
| 1 | 1933-11-17 | `pet_registered` | Olivos | Born to particular family. `acquisition_method='bred'`. |
| 2 | 1933-12-22 | `abandonment_reported` ⚑ | Olivos | Family surrenders by housebreaking issues. `reporter_role='owner'`. |
| 3 | 1933-12-22 | `shelter_intake_recorded` ⚑ | Olivos | Refugio "Patitas de Olivos". `intake_reason='surrender'`, condition='healthy'. |
| 4 | 1934-01-08 | `vaccination_administered` | Olivos | Moquillo. |
| 5 | 1934-02-04 | `foster_proposed` ⚑ | Olivos | Org → Carl Spitz (entrenador de cine). |
| 6 | 1934-02-05 | `foster_proposal_accepted` ⚑ | Olivos | Spitz accept. |
| 7 | 1934-02-05 | `foster_assigned` | Olivos | 4 semanas evaluación. |
| 8 | 1934-02-15 | `note_added` ⚑ | Olivos | *"Terry resuelve problemas espaciales que no le enseñé."* — C. Spitz. `category='entrenamiento'`. |
| 9 | 1934-03-04 | `adoption_application_submitted` | Olivos | Spitz aplica para adopción. |
| 10 | 1934-03-08 | `adoption_application_approved` | Olivos | Aprobada. |
| 11 | 1934-03-08 | `foster_ended` | Olivos | Cierre tránsito. |
| 12 | 1934-03-08 | `adoption_finalized` | Olivos | Composite. |
| 13 | 1934-06-22 | `vet_visit_logged` | Olivos | Wellness post-adoption. |
| 14 | 1934-09-09 | `weight_recorded` | Olivos | 5.5 kg. |
| 15 | 1934-12-15 | `note_added` ⚑ | Saavedra | Casting *Bright Eyes* (versión argentina). Seleccionada. `category='hito_profesional'`. |
| 16 | 1935-04-22 | `vaccination_administered` | Olivos | Anual. |
| 17 | 1935-09-09 | `note_added` | Saavedra | Estreno *Bright Eyes*. |
| 18 | 1936-05-30 | `note_added` | Saavedra | Rodaje *Fury*. |
| 19 | 1937-03-15 | `vaccination_administered` | Olivos | Anual. |
| 20 | 1937-08-08 | `weight_recorded` | Olivos | 6.8 kg. |
| 21 | 1938-04-22 | `note_added` ⚑ | Saavedra | Inicio rodaje *El Mago de Oz* (versión argentina, Argentina Sono Film). `category='hito_profesional'`. |
| 22 | 1938-06-15 | `incident_reported` ⚑ | Saavedra | `incident_type='fall'`. Tramoyista pisa pata derecha durante secuencia con bruja. Fractura cerrada metatarso III. |
| 23 | 1938-06-15 | `clinical_info_logged` ⚑ | Saavedra | `sub_kind='imaging'`. Rx pata: fractura confirmada. |
| 24 | 1938-06-16 | `clinical_info_logged` | Saavedra | `sub_kind='surgery'`. Inmovilización con férula. |
| 25 | 1938-06-18 | `medication_started` | Saavedra | Antibiótico + analgésico. |
| 26 | 1938-06-22 | `status_changed` ⚑ | Saavedra | → `lost`. Escape del estudio durante recuperación. |
| 27 | 1938-06-23 | `credential_scanned` | Plaza de Mayo, CABA | Scaneada por una empleada de Casa Rosada, **Aída Bruzzese**. |
| 28 | 1938-06-23 | `status_changed` | Saavedra | → `active`. |
| 29 | 1938-07-15 | `medication_stopped` | Saavedra | Curso completado. Recuperación total. |
| 30 | 1938-08-04 | `pet_profile_updated` ⚑ | Saavedra | `changes=[{field:'stage_name', old:null, new:'Toto'}]`. Registered stage name added. |
| 31 | 1938-11-09 | `note_added` | Saavedra | Estreno *El Mago de Oz*. `category='hito_profesional'`. |
| 32 | 1939-04-22 | `vaccination_administered` | Olivos | Anual. |
| 33 | 1940-03-15 | `note_added` | Saavedra | Rodaje *The Women*. |
| 34 | 1941-06-22 | `weight_recorded` | Olivos | 7.0 kg. |
| 35 | 1942-09-09 | `vaccination_administered` | Olivos | Anual. |
| 36 | 1943-02-14 | `note_added` ⚑ | Saavedra | Última aparición en cine. *Tortilla Flat*. Retiro. `category='retiro'`. |
| 37 | 1943-08-08 | `vet_visit_logged` | Olivos | Senior wellness. |
| 38 | 1944-04-04 | `status_changed` ⚑ | Plaza Italia, Palermo | → `lost`. Escapa durante paseo con Spitz. |
| 39 | 1944-04-05 | `credential_scanned` | Plaza Italia | **Dorothea Garber**, vecina, escanea. |
| 40 | 1944-04-05 | `status_changed` | Olivos | → `active`. |
| 41 | 1944-09-09 | `vaccination_administered` | Olivos | Anual. |
| 42 | 1945-03-22 | `symptom_observed` ⚑ | Olivos | Decaimiento + anorexia. |
| 43 | 1945-04-04 | `clinical_info_logged` | Olivos | `sub_kind='lab_work'`. Anemia normocítica, hallazgos compatibles con neoplasia oculta. |
| 44 | 1945-05-15 | `vet_visit_logged` | Olivos | Quality-of-life check. |
| 45 | 1945-09-01 | `death_recorded` ⚑ | Olivos | `cause='disease'`, `cause_detail='neoplasia hematopoyética + falla orgánica multisistémica (edad 11 a)'`, `confirmed_by_vet=true`, `vet_name='Dra. Inés Bardelli'`, `disposition_method='owner_burial'`, `facility='Quinta Spitz, Olivos'`, `death_at_clinic=false`, `is_reportable=false`. |
| 46 | 1945-09-02 | `note_added` ⚑ | Olivos | *"Terry: nadie volvió a saltar tan lejos con tan poco peso. Buen viaje. — C. Spitz."* `category='despedida'`. |

**Uncommon events tagged: 13**

> **No replacement registered.** Franchise rule.

---

## 5. Kabosu  ·  `dog`  ·  Shiba Inu  ·  Female

- **Breed:** Shiba Inu
- **Color/coat:** Rojo-sable
- **DOB:** 2005-11-02
- **Owner of record:** Refugio "Patitas Salteñas" (2008-04 to 2008-11) → **Atsuko Sato** (2008-11 onward, Belgrano R)
- **Microchip:** Yes — `941-300-400-500-001` (Argentina country code 858 not used; clinic standard). **The only chipped pet in this batch.**
- **Public token (test):** `DIM-KABO-0019`
- **Estimated weight:** 9.2 kg
- **Known allergies:** Ninguna documentada
- **PPP:** false
- **Jurisdiction:** AR / Salta (origin) → AR / Ciudad Autónoma de Buenos Aires / Belgrano R
- **Status:** `deceased`
- **Acquisition:** `rescued`
- **Notable:** Test fixture for: viral-public-scan stress (`credential_scanned` burst with 30+ rows in one day), recurring `libreta_shared_viewed` from media inquiries, terminal-disease arc with `medication_started/dose_taken/stopped` cadence, and canon-friend replacement.

| # | Date | Event | Location | Details |
|---|------|-------|----------|---------|
| 1 | 2005-11-02 | `pet_registered` | Salta Capital | Born in unregistered breeding facility. `acquisition_method='unknown'` (origin opaque). |
| 2 | 2006-03-15 | `custody_transferred` | Salta | Vendida a primera dueña, Sra. Cardozo. |
| 3 | 2006-04-22 | `vaccination_administered` | Salta | Moquillo. |
| 4 | 2007-08-08 | `weight_recorded` | Salta | 8.4 kg. |
| 5 | 2008-04-15 | `abandonment_reported` ⚑ | Salta | Cardozo cierra criadero por inspección sanitaria; abandona 19 perros. Welfare report opened. |
| 6 | 2008-04-15 | `maltreatment_reported` ⚑ | Salta | `kind='negligencia + abandono'`, severity=alta. Para Ley 14.346. |
| 7 | 2008-04-16 | `shelter_intake_recorded` ⚑ | Salta | "Refugio Patitas Salteñas". `intake_reason='seizure'`, `intake_condition='underweight + dermatosis'`. |
| 8 | 2008-04-17 | `vet_visit_logged` | Salta | Intake exam. BCS 3/9. |
| 9 | 2008-04-20 | `deworming_administered` | Salta | Standard. |
| 10 | 2008-05-04 | `vaccination_administered` | Salta | Booster. |
| 11 | 2008-06-15 | `microchip_implanted` ⚑ | Salta | Chip `941-300-400-500-001`, interscapular_left. |
| 12 | 2008-09-22 | `weight_recorded` | Salta | 9.0 kg (recuperación). |
| 13 | 2008-10-04 | `adoption_application_submitted` | Salta | Solicitante: Atsuko Sato (maestra jardinera, residente CABA temporalmente en Salta). |
| 14 | 2008-10-08 | `adoption_application_approved` | Salta | Aprobada. |
| 15 | 2008-11-15 | `adoption_finalized` ⚑ | Salta → Belgrano R | Composite. Sato regresa a CABA con Kabosu. Followup 12 mo. |
| 16 | 2009-01-22 | `post_adoption_checkin` | Belgrano R | 2-mes. |
| 17 | 2009-05-15 | `post_adoption_checkin` | Belgrano R | 6-mes. |
| 18 | 2009-11-15 | `post_adoption_checkin` | Belgrano R | 12-mes (cierre). |
| 19 | 2010-02-13 | `pet_profile_updated` ⚑ | Belgrano R | Foto reemplazada — la imagen icónica de Kabosu sentada en el sillón. Será viral globalmente. |
| 20 | 2010-02-23 | `libreta_shared_viewed` ⚑ | (telemetry) | Tier-2 — Sato comparte foto al blog "Maru in Jiji". Inicio de la viralización. |
| 21 | 2010-04-22 | `vaccination_administered` | Belgrano R | Anual. |
| 22 | 2011-09-09 | `weight_recorded` | Belgrano R | 10.1 kg (sobrepeso leve). |
| 23 | 2012-04-22 | `vet_visit_logged` | Belgrano R | Wellness. |
| 24 | 2013-12-08 | `credential_scanned` ⚑ | Belgrano R | **Inicio del fenómeno Dogecoin.** Public-credential scan count: 1 (manualmente). |
| 25 | 2013-12-09 | `credential_scanned` ⚑ | Belgrano R | Día siguiente: **30+ scans únicos en 24 h** (burst). Cada uno con `viewer_authenticated=false`, `is_self_scan=false`. **Edge case: throughput stress on public_token.** |
| 26 | 2013-12-10 | `credential_scanned` | Belgrano R | Sostenido — 12 scans. |
| 27 | 2013-12-11 | `credential_scanned` | Belgrano R | 8 scans. |
| 28 | 2014-01-15 | `libreta_shared_viewed` ⚑ | (telemetry) | Sato comparte historial filtrado a periodista de *The Verge*. |
| 29 | 2014-04-22 | `vaccination_administered` | Belgrano R | Anual. |
| 30 | 2015-08-08 | `weight_recorded` | Belgrano R | 10.4 kg. |
| 31 | 2016-03-15 | `incident_reported` ⚑ | Bosques de Palermo, CABA | `incident_type='escape'`. Atrapada en multitud durante evento fan. Recuperada en 2 h. |
| 32 | 2016-09-22 | `vaccination_administered` | Belgrano R | Anual. |
| 33 | 2017-05-30 | `symptom_observed` ⚑ | Belgrano R | Masa palpable región axilar derecha. |
| 34 | 2017-06-04 | `clinical_info_logged` | Belgrano R | `sub_kind='imaging'`. Eco — masa quística, sin malignidad evidente. |
| 35 | 2017-06-15 | `clinical_info_logged` ⚑ | Belgrano R | `sub_kind='lab_work'`. Citología por aspirado — benigna. |
| 36 | 2018-04-22 | `vaccination_administered` | Belgrano R | Anual. |
| 37 | 2018-12-04 | `libreta_shared_viewed` | (telemetry) | Tier-2 share a documentalista. |
| 38 | 2019-09-30 | `weight_recorded` | Belgrano R | 10.0 kg. |
| 39 | 2020-04-22 | `vet_visit_logged` | Belgrano R | Telemed (ASPO). |
| 40 | 2021-04-22 | `vaccination_administered` | Belgrano R | Anual. |
| 41 | 2022-05-15 | `symptom_observed` ⚑ | Belgrano R | Letargo persistente + anorexia parcial. |
| 42 | 2022-05-22 | `clinical_info_logged` ⚑ | Belgrano R | `sub_kind='lab_work'`. Hemograma: anemia + plaquetopenia. Sospecha hematológica. |
| 43 | 2022-06-04 | `clinical_info_logged` ⚑ | Belgrano R | `sub_kind='lab_work'`. Frotis + bioquímica: **leucemia crónica + hepatopatía**. |
| 44 | 2022-06-15 | `medication_started` ⚑ | Belgrano R | Prednisolona + clorambucilo. |
| 45 | 2022-06-16 | `medication_dose_taken` | Belgrano R | Día 1 adherence. |
| 46 | 2022-09-22 | `medication_dose_taken` | Belgrano R | Día ~100 adherence (sample). |
| 47 | 2022-12-04 | `libreta_shared_viewed` ⚑ | (telemetry) | Share a oncólogo especialista para segunda opinión. |
| 48 | 2023-04-22 | `vet_visit_logged` | Belgrano R | Quality-of-life check. |
| 49 | 2023-09-30 | `weight_recorded` | Belgrano R | 8.8 kg (pérdida). |
| 50 | 2024-02-14 | `clinical_info_logged` | Belgrano R | `sub_kind='imaging'`. Eco abdominal — hepatomegalia, esplenomegalia. |
| 51 | 2024-04-22 | `medication_stopped` | Belgrano R | Suspensión gradual — quality-of-life. |
| 52 | 2024-05-15 | `note_added` ⚑ | Belgrano R | Sato anuncia públicamente que Kabosu está en sus últimos días. `category='comunicación pública'`. |
| 53 | 2024-05-24 | `death_recorded` ⚑ | Belgrano R | `cause='disease'`, `cause_detail='leucemia crónica + hepatopatía terminal'`, `confirmed_by_vet=true`, `vet_name='Dr. Pereyra'`, `disposition_method='cremation_individual_ashes'`, `facility='Crematorio Mascotas Norte, Tigre'`, `death_at_clinic=false`, `is_reportable=false`. |
| 54 | 2024-05-25 | `note_added` ⚑ | Belgrano R | *"Kabosu: nunca quisiste ser un meme. Fuiste vos, sentada en un sillón, mirando con un poco de cansancio. Gracias por dejarte querer por tanta gente. — Atsuko."* `category='despedida'`. |
| 55 | 2024-06-04 | `libreta_shared_viewed` ⚑ | (telemetry) | 47 shares en 7 días (burst de prensa internacional). |
| 56 | 2024-08-15 | `pet_registered` ⚑ | Belgrano R | **NEW PET to Atsuko Sato.** Name: **Hanako**. Shiba Inu, female, adoptada del mismo refugio Salta. See §5b. |

**Uncommon events tagged: 18**

### §5b. Hanako — Replacement registered to Atsuko Sato

- **Species:** `dog`, **Shiba Inu**, female
- **Owner:** Atsuko Sato (Belgrano R, continuing).
- **Microchip:** `941-300-400-500-101`, implanted at intake.
- **Public token:** `DIM-HNKO-0019B`

| # | Date | Event | Location | Details |
|---|------|-------|----------|---------|
| 1 | 2024-08-15 | `pet_registered` | Belgrano R | `acquisition_method='adopted'`. From Refugio Patitas Salteñas (continuity). |
| 2 | 2024-08-15 | `shelter_intake_recorded` | Salta | Org. |
| 3 | 2024-08-16 | `microchip_implanted` | Belgrano R | Chip. |
| 4 | 2024-08-20 | `adoption_application_submitted` | Belgrano R | Sato — pre-approved by historial. |
| 5 | 2024-08-22 | `adoption_application_approved` | Belgrano R | Aprobada. |
| 6 | 2024-08-22 | `adoption_finalized` | Belgrano R | Composite. |
| 7 | 2024-09-15 | `vet_visit_logged` | Belgrano R | Wellness. |
| 8 | 2024-10-20 | `post_adoption_checkin` | Belgrano R | 2-mes. |
| 9 | 2025-03-22 | `weight_recorded` | Belgrano R | 8.5 kg. |
| 10 | 2025-09-30 | `vaccination_administered` | Belgrano R | Anual. |
| 11 | 2026-04-22 | `vet_visit_logged` | Belgrano R | Wellness. |

---

## Cross-pet coverage matrix

Counts across the 5 iconic + 2 replacement storylines:

| Event type | Hits |
|---|---:|
| `pet_registered` | 7 |
| `pet_profile_updated` | 8 |
| `status_changed` | 24 |
| `death_recorded` | 4 (Laika, Hachikō, Pal, Terry, Kabosu) |
| `vaccination_administered` | ~24 |
| `deworming_administered` | 4 |
| `sterilization_performed` | 0 — none of these underwent it on record |
| `medication_started` | 6 |
| `medication_stopped` | 4 |
| `medication_dose_taken` | 2 |
| `vet_visit_logged` | ~22 |
| `weight_recorded` | ~16 |
| `microchip_implanted` | 2 (Kabosu + Hanako only) |
| `microchip_replaced` | 0 in this batch |
| `microchip_revoked` | 0 |
| `dangerous_breed_attested` | 0 |
| `note_added` | 18 |
| `credential_scanned` | 12 (Hachikō recurring + Kabosu viral burst) |
| `incident_reported` | 9 |
| `rabies_observation_started` | 1 (Pal) |
| `rabies_observation_ended` | 1 |
| `symptom_observed` | 9 |
| `abandonment_reported` | 2 (Terry, Kabosu) |
| `maltreatment_reported` | 2 (Laika, Kabosu) |
| `clinical_info_logged` | ~18 (across lab_work / imaging / surgery / other) |
| `shelter_intake_recorded` | 4 |
| `foster_assigned` | 1 (Terry) |
| `foster_ended` | 1 |
| `foster_proposed` | 1 |
| `foster_proposal_accepted` | 1 |
| `foster_proposal_rejected` | 0 |
| `foster_proposal_cancelled` | 0 |
| `foster_proposal_expired` | 0 |
| `foster_co_foster_allowed` | 0 |
| `adoption_application_submitted` | 3 |
| `adoption_application_approved` | 3 |
| `adoption_application_rejected` | 0 |
| `adoption_finalized` | 3 |
| `post_adoption_checkin` | 5 |
| `adoption_revoked` | 1 (Pal, applied to surrender) |
| `adoption_withdrawn` | 0 |
| `adoption_eligibility_set` | 0 |
| `custody_transferred` | 5 |
| `custody_transfer_proposed` | 2 |
| `custody_dispute_raised` | 1 (Hachikō) |
| `custody_dispute_resolved` | 1 |
| `libreta_shared_viewed` | 6 |
| `outbreak_signal` | 1 (Laika, posthumous false positive) |

**Gaps in this batch** (already covered in `docs/archive/historia otras mascotas.txt`'s sibling batch or to be added in subsequent rewrites):
`sterilization_performed`, `microchip_replaced`, `microchip_revoked`,
`dangerous_breed_attested`, `foster_proposal_{rejected,cancelled,expired}`,
`foster_co_foster_allowed`, `adoption_application_rejected`,
`adoption_withdrawn`, `adoption_eligibility_set`.

---

## Workflow stressors this batch uniquely exercises

1. **Location_description that exits Earth** — Laika's `status_changed → lost` with `location_description='órbita terrestre baja, Sputnik 2'`. Tests that the field accepts arbitrary strings.
2. **disposition_method = `unknown`** with a facility note explaining why no body was recoverable — Laika's `death_recorded`.
3. **Posthumous notes added decades after death** — Laika's record gets new `note_added` events in 1993, 2008, 2014, 2017, 2022, 2023. Tests that the timeline is happy with retroactive inserts under `author_role='admin'`.
4. **outbreak_signal on a long-deceased pet** — Laika 2022. False positive that must close cleanly without affecting the projection.
5. **Owner death cascade onto pet record** — Hachikō 1925-05-21: incident_reported(other, severity='fatal_to_owner') + custody_dispute_raised same minute, custody_transferred + custody_dispute_resolved 14 days later.
6. **9-year recurring lost-found loop at one fixed landmark** — Hachikō at Estación Retiro, ~5 documented cycles. Tests that the projection over `status_changed` doesn't choke on dense recurrence.
7. **Public-credential viral burst** — Kabosu 2013-12-08/09/10/11: 50+ `credential_scanned` rows in 96 hours. Tests `public_token` throughput and the scan-events index.
8. **Career-milestone notes alongside medical history** — Pal and Terry have `note_added` entries for film roles interleaved with vaccinations and injuries. Tests the libreta filter correctly excludes `note_added` with `category!='medical'`.
9. **Behavioral-history-driven ownership transfer using adoption_revoked outside an org context** — Pal 1942-03-15. Edge case for `adoption_revoked` validation.
10. **Single bite incident triggering the full rabies pair** — Pal 1941-02. Useful baseline for the rabies-observation cron.

---

---

## Legends Batch (seed-storylines-legends.ts)

Three historically iconic dogs relocated to Argentina, purpose-built to cover the 5 event types
missing from the iconic + original-10 + dangerous + supporting batches.

> Tokens: `DIM-BOBB-0022`, `DIM-FRID-0023`, `DIM-OWNY-0024`.  
> Collision note: 0020 = Cujo, 0021 = Roco (dangerous batch). Legends start at 0022.

---

### 8. Bobbie el Maravilla  ·  `dog`  ·  Scotch Collie  ·  Male

- **Public token:** `DIM-BOBB-0022`
- **DOB:** 1921-09-01 (estimated)
- **Color:** Sable y blanco
- **Owner:** Graciela Saavedra (`graciela`)
- **Jurisdiction:** AR / Buenos Aires / Mar del Plata
- **Status:** `deceased` (1927-03-18)
- **Microchip:** None (1921 — predates technology)
- **Tattoo:** `MDP-1923-BOB` (inner_ear_left, re-tattooed via `tattoo_updated`)
- **Weight:** 8.0 kg estimated
- **Notable:** Canon adaptation of the real Bobbie the Wonder Dog (1923). Lost in Salta during a vacation trip; walked ~4,000 km back to Mar del Plata alone in ~6 months.

| # | Date | Event | Location | Details |
|---|------|-------|----------|---------|
| 1 | 1921-09-15 | `pet_registered` | Mar del Plata, BA | Scotch collie cachorro, `acquisition_method='purchased'`. |
| 2 | 1921-10-01 | `vet_visit_logged` | Mar del Plata | Examen de ingreso. |
| 3 | 1921-10-15 | `vaccination_administered` | Mar del Plata | Antirrábica. |
| 4 | 1922-03-10 | `weight_recorded` | Mar del Plata | 11.0 kg. |
| 5 | 1922-06-15 | `vaccination_administered` | Mar del Plata | Moquillo + parvovirus. |
| 6 | 1922-09-01 | `note_added` ⚑ | Mar del Plata | Siempre vuelve a casa solo desde la costa. |
| 7 | 1923-01-22 | `weight_recorded` | Mar del Plata | 14.0 kg. |
| 8 | 1923-04-08 | `vaccination_administered` | Mar del Plata | Antirrábica. |
| 9 | 1923-07-15 | `vet_visit_logged` | Mar del Plata | Control anual. Sano, excelente condición física. |
| 10 | 1923-07-20 | `tattoo_recorded` ⚑ | Mar del Plata | Código `MDP-1923-BOB`, `inner_ear_left`, `tattoo_date_known=true`. Pre-viaje. Canonical row → `pet_identifications`. |
| 11 | 1923-08-15 | `status_changed` ⚑ | Salta Capital | `to_status='lost'`. Perdido en viaje vacacional. |
| 12 | 1923-08-22 | `note_added` ⚑ | Tucumán Capital | Avistamiento — llevado al refugio municipal. |
| 13 | 1923-08-25 | `custody_transfer_proposed` ⚑ | Tucumán Capital | Refugio propone devolución a familia Nores. `proposed_at` ISO datetime. |
| 14 | 1923-09-02 | `custody_transfer_cancelled` ⚑ | Tucumán Capital | Refugio cancela: Bobbie escapó antes de ingresar. `cancelled_by='auto_cancel'`. |
| 15–20 | 1923-09-10 → 1924-01-10 | `note_added` ×6 ⚑ | Santiago del Estero → Córdoba → Santa Fe → BA (Tandil) | Avistamientos a lo largo de la ruta. `author_role='system'`. |
| 21 | 1924-02-04 | `status_changed` | Mar del Plata | `to_status='active'`. Regresó solo. |
| 22 | 1924-02-04 | `ownership_claimed` ⚑ | Mar del Plata | Familia reclamó por tatuaje. `identifier_kind='tattoo'`. |
| 23 | 1924-02-05 | `note_added` ⚑ | Mar del Plata | Noticia en El Atlántico. "El perro que caminó solo desde Salta." |
| 24 | 1924-02-10 | `vet_visit_logged` ⚑ | Mar del Plata | Examen post-regreso. Desnutrición moderada, callosidades. |
| 25 | 1924-02-12 | `weight_recorded` | Mar del Plata | 11.5 kg. |
| 26 | 1924-02-15 | `medication_started` | Mar del Plata | Suplemento vitamínico + proteico 30 días. |
| 27 | 1924-03-20 | `medication_stopped` | Mar del Plata | Recuperación completa. |
| 28 | 1924-04-22 | `vaccination_administered` | Mar del Plata | Antirrábica (dosis de reingreso). |
| 29 | 1924-06-01 | `weight_recorded` | Mar del Plata | 13.8 kg. |
| 30 | 1924-09-15 | `vaccination_administered` | Mar del Plata | Anual. |
| 31 | 1924-11-03 | `note_added` ⚑ | Mar del Plata | Placa municipal "El Perro Viajero". Ceremonia plaza San Martín. |
| 32 | 1925-04-15 | `vaccination_administered` | Mar del Plata | Anual. |
| 33 | 1925-08-08 | `vet_visit_logged` | Mar del Plata | Wellness. |
| 34 | 1925-11-10 | `tattoo_updated` ⚑ | Mar del Plata | Re-tatuaje por fading solar; código idéntico, trazo más profundo. |
| 35 | 1926-04-22 | `vaccination_administered` | Mar del Plata | Anual. |
| 36 | 1926-08-15 | `weight_recorded` | Mar del Plata | 13.2 kg. |
| 37 | 1926-11-20 | `symptom_observed` ⚑ | Mar del Plata | Cojera posterior izquierda. Artritis senil incipiente. |
| 38 | 1926-12-01 | `medication_started` | Mar del Plata | Aspirina paliativa, 60 días. |
| 39 | 1927-03-18 | `death_recorded` ⚑ | Mar del Plata | `cause='natural'`. Vejez + artritis + fallo orgánico. No reportable. |
| 40 | 1927-03-19 | `note_added` ⚑ | Mar del Plata | Despedida de la familia. "Caminaste más que ninguno." |

**Workflow stressors:**
- `custody_transfer_proposed` → `custody_transfer_cancelled` (first in dataset to exercise the cancel path).
- `ownership_claimed` with `identifier_kind='tattoo'` — temporally coherent: tattoo recorded pre-viaje (1923-07-20), claimed by tattoo on return (1924-02-04).
- 6 `note_added` avistamiento records with `author_role='system'` spanning 5 provinces.
- `tattoo_recorded` (pre-trip) + `tattoo_updated` (sun-fading) pair (canonical `pet_identifications` row written by seed, fitness sweep validates).

---

### 9. Frida la Rescatista  ·  `dog`  ·  Labrador Retriever  ·  Female

- **Public token:** `DIM-FRID-0023`
- **DOB:** 2009-04-15
- **Color:** Castaña (chocolate)
- **Owner:** org `mascotas-ba-centro` (Mascotas BA Centro — sanitary authority)
- **Jurisdiction:** AR / CABA / Retiro
- **Status:** `deceased` (2022-11-15)
- **Microchip:** `985170007654321` (implanted 2009-06-10, `interescapular`). Canonical row derived from `microchip_implanted` event (bio field is null — tests event-fallback path in seed loader).
- **Service dog:** `pet_service_dog` row — USAR / Defensa Civil CABA, `credential_status='vencida'` (expired at retirement 2019).
- **Weight:** 32.0 kg
- **Notable:** USAR dog with 52 certified rescues 2012–2018. Deployed Catamarca 2017 earthquake. Leishmaniasis 2017, treated, survived. Retired 2019, died 2022.

| # | Date | Event | Location | Details |
|---|------|-------|----------|---------|
| 1 | 2009-06-01 | `pet_registered` | Retiro, CABA | `acquisition_method='bred'`. |
| 2 | 2009-06-10 | `microchip_implanted` | Retiro, CABA | Chip `985170007654321`, interscapular. `implant_date_known=true`. |
| 3 | 2009-06-15 | `vet_visit_logged` | Retiro | Examen de ingreso. |
| 4 | 2009-06-20 | `vaccination_administered` | Retiro | Antirrábica. |
| 5 | 2009-07-05 | `deworming_administered` | Retiro | Estándar. |
| 6 | 2009-09-01 | `weight_recorded` | Retiro | 12.5 kg (cachorra). |
| 7–20 | 2010–2016 | Rutina (vacunas, peso, vet, notas de entrenamiento) | Retiro, CABA | Formación USAR + despliegues CABA. |
| 21 | 2017-01-17 | `status_changed` | Catamarca Capital | `to_status='lost'` durante sismo. Despegue urgente. |
| 22 | 2017-01-17 | `note_added` | Catamarca | Sismo 5.8. Frida desplegada en búsqueda de víctimas. |
| 23 | 2017-01-20 | `symptom_observed` | Catamarca | Fiebre, lesiones cutáneas. `welfare_report_id=null` (source='libreta'). |
| 24 | 2017-01-22 | `clinical_info_logged` | Catamarca | Sub_kind='lab_work'. PCR leishmania positivo. |
| 25 | 2017-01-25 | `disease_reported` ⚑ | Catamarca | `disease='other'`, `confirmed_by_lab=true`, `date_of_onset='2017-03-01'`. Clinical notes: leishmaniasis visceral. |
| 26 | 2017-01-26 | `medication_started` | Catamarca | Glucantime. `frequency='once_daily'`. |
| 27 | 2017-01-30 | `status_changed` | Catamarca | `to_status='active'` (regresó al equipo). |
| 28–35 | 2017-02 → 2019-05 | Medicación, seguimiento, vacunas, peso | Retiro, CABA | Tratamiento y recuperación leishmania. |
| 36 | 2019-06-15 | `note_added` ⚑ | Retiro, CABA | Retiro con honores. 52 rescates certificados. |
| 37–46 | 2019-07 → 2022-10 | Rutina geriátrica (vet, vacunas, peso, síntomas) | Retiro, CABA | Seguimiento post-retiro. Signos de vejez. |
| 47–53 | 2022-10 → 2022-11-14 | `symptom_observed`, `clinical_info_logged`, medicaciones | Retiro, CABA | Deterioro. Anemia, pérdida de peso severa. |
| 54 | 2022-11-15 | `death_recorded` ⚑ | Retiro, CABA | `cause='disease'`. Incineración pública con ceremonia. |
| 55 | 2022-11-16 | `note_added` | Retiro, CABA | "Frida, 52 vidas salvadas. La recordamos." |

**Workflow stressors:**
- `disease_reported` (first in dataset).
- `microchip_implanted` event present but `bio.microchip_id=null` → tests seed's event-fallback path for canonical `pet_identifications` row.
- `pet_service_dog` table row (USAR credential, `vigente → vencida` at retirement).
- `symptom_observed` with `welfare_report_id=null` and `source='libreta'` (schema constraint test).

---

### 10. Owney el Perro Postal  ·  `dog`  ·  Terrier Mestizo  ·  Male

- **Public token:** `DIM-OWNY-0024`
- **DOB:** 1888-01-01 (estimated)
- **Color:** Gris y blanco jaspeado
- **Owner:** org `rescate-puerto-madero` (Red de Rescate Puerto Madero)
- **Jurisdiction:** AR / CABA / Retiro
- **Status:** `deceased` (1897-06-11)
- **Microchip:** None (1888 — predates technology)
- **Tattoo:** `CAR-1888-OWN` (inner_ear_left, re-tattooed `CAR-1888-OWN-V2` via `tattoo_updated` after fading)
- **Weight:** 10.0 kg estimated
- **Notable:** Canon adaptation of Owney, the unofficial mascot of the U.S. Railway Mail Service. Relocated to Correo Argentino base Retiro. 10+ provinces visited. International trip to Montevideo. 36 events spanning 9 years.

| # | Date | Event | Location | Details |
|---|------|-------|----------|---------|
| 1 | 1888-03-01 | `pet_registered` | Retiro, CABA | `acquisition_method='found_stray'`. Cachorro callejero adoptado por el Correo. |
| 2 | 1888-03-10 | `vet_visit_logged` | Retiro | Examen de ingreso. Sano. |
| 3 | 1888-04-01 | `vaccination_administered` | Retiro | Antirrábica (nueva política del correo). |
| 4 | 1888-05-15 | `tattoo_recorded` ⚑ | Retiro, CABA | Código `CAR-1888-OWN`, `inner_ear_left`, `tattoo_date_known=true`. |
| 5–7 | 1888-06 → 1888-12 | `note_added` ×3 | Rosario, Santa Fe; Córdoba Capital; Mendoza Capital | Primeros viajes a bordo de valijas postales. Avistamientos registrados. |
| 8 | 1889-03-01 | `weight_recorded` | Retiro, CABA | 9.2 kg. |
| 9–11 | 1889-04 → 1889-11 | `note_added` ×3 | Tucumán; Salta; Jujuy | Ruta norte. Postal confirma presencia en sacas de correo. |
| 12 | 1890-02-01 | `tattoo_updated` ⚑ | Retiro, CABA | Código `CAR-1888-OWN-V2`, mismo sitio. Repasado por desvanecimiento. |
| 13–15 | 1890-06 → 1891-03 | `note_added` ×3 | Bariloche, Río Negro; Neuquén; Mar del Plata, BA | Rutas patagónica y atlántica. |
| 16–17 | 1891-06 → 1891-09 | `note_added` ×2 | Montevideo, Uruguay (viaje internacional) | Ferry Buenos Aires–Montevideo. Única salida internacional registrada. |
| 18 | 1892-01-15 | `vaccination_administered` | Retiro, CABA | Antirrábica refuerzo. |
| 19–21 | 1892-06 → 1893-04 | `note_added` ×3 | Paraná, Entre Ríos; Corrientes; Posadas, Misiones | Ruta litoral noreste. |
| 22 | 1893-09-01 | `weight_recorded` | Retiro, CABA | 10.3 kg (adulto maduro). |
| 23–25 | 1894-02 → 1895-08 | `note_added` ×3 | La Rioja; San Juan; San Luis | Rutas del interior. |
| 26 | 1895-10-15 | `vet_visit_logged` | Retiro, CABA | Signos de vejez. Artritis leve. |
| 27–28 | 1896-02 → 1896-06 | `note_added` ×2 | Santiago del Estero; Chaco | Últimas rutas largas. Viaje más lento. |
| 29 | 1896-09-01 | `symptom_observed` | Retiro, CABA | Cojera pronunciada artritis. |
| 30 | 1896-10-01 | `clinical_info_logged` | Retiro, CABA | Diagnóstico: artritis avanzada. Reposo recomendado. |
| 31 | 1896-11-01 | `medication_started` | Retiro, CABA | Analgésico. `frequency='once_daily'`. |
| 32 | 1897-01-15 | `note_added` | Retiro, CABA | "Owney ya no embarca. Se queda en la oficina central." |
| 33 | 1897-03-01 | `weight_recorded` | Retiro, CABA | 8.9 kg (pérdida por vejez). |
| 34 | 1897-04-01 | `vet_visit_logged` | Retiro, CABA | Deterioro progresivo. |
| 35 | 1897-06-01 | `clinical_info_logged` | Retiro, CABA | Fallo orgánico múltiple. Pronóstico reservado. |
| 36 | 1897-06-11 | `death_recorded` ⚑ | Retiro, CABA | `cause='violent'` (veterinario aplicó eutanasia). |

**Workflow stressors:**
- 14+ `note_added` records across 14 provinces + 1 international stop. Tests timeline rendering with large geographic spread.
- `tattoo_recorded` + `tattoo_updated` pair (second in dataset alongside Bobbie).
- Death via euthanasia (`cause='violent'` — vet-administered — the only such cause in the dataset).
- Canonical tattoo code (`CAR-1888-OWN`) in `pet_identifications`; fitness sweep validates it against projection.

---

## Known coverage gaps (2026-06)

The following event types exist in `EVENT_TYPES` but are not exercised by any
storyline in the current dataset. Left as TODOs for the next batch:

1. **`microchip_corrected`** — no storyline records a chip number correction after
   an initial implant. The `replayPetMicrochip` projection does not yet branch on
   this type; once it does, a storyline will be needed.
2. **`custody_dispute_cancelled`** — disputes in the dataset are always resolved,
   never cancelled before resolution.
3. **`welfare_report_escalated`** — `welfare_reports` exist but none have an
   escalation event attached.
4. **`outbreak_signal_closed`** — Laika's 2022 outbreak signal is seeded but the
   corresponding close event is absent.
5. **`physical_tag_issued`** — no pet in the seed has received a physical collar
   tag via the platform.

— End —
