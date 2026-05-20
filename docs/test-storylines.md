# Pet Storylines — Workflow Test Fixtures

> **Purpose.** Rich, fictional pet biographies used as test data for MiMAR/DIM workflow exploration. Every storyline is **>40 chronologically ordered events** with **≥10 "uncommon" events** drawn from each character's canon (marked `⚑`).
>
> **Format.** Per pet: short bio block + dated event log. Dates are plausible/coherent within each pet's lifespan, not strictly canonical. Designed to stress-test ownership transfers, jurisdiction changes, lost/found cycles, scan events, medical timelines, foster/shelter flows, and edge cases (death + resurrection, multiple owners, missing chips, foreign-jurisdiction reentry, etc.).
>
> **Event-type vocabulary used (informal):** `birth`, `intake`, `adoption`, `ownership_transfer`, `foster_in`, `foster_out`, `microchip_implant`, `microchip_lost`, `credential_issued`, `credential_renewed`, `credential_revoked`, `scan_public`, `scan_clinic`, `vaccination`, `vet_visit_wellness`, `vet_visit_illness`, `vet_visit_injury`, `surgery`, `dental`, `imaging`, `lab_work`, `medication_start`, `medication_stop`, `allergy_diagnosis`, `weight_check`, `behavior_incident`, `behavior_therapy_start`, `bite_report`, `lost_report`, `found_report`, `travel_record`, `jurisdiction_transfer`, `insurance_enrollment`, `breed_reassessment`, `dna_test`, `spay_neuter`, `death`, `posthumous_record`, `resurrection` (yes, really — Brian).

---

## 1. Scooby-Doo  ·  Great Dane  ·  Male

- **Aliases:** Scoobert Doo, Scooby
- **Color/coat:** Brown with black spots
- **Owner of record:** Norville "Shaggy" Rogers (Coolsville, OH)
- **Microchip:** `985-112-345-678-901`
- **Public token (test):** `DIM-SCDO-0001`
- **Known conditions:** Generalized anxiety disorder (canine), shellfish allergy, mild hip dysplasia, hyperphagia.
- **PPP flag:** N/A (non-PPP breed)

| # | Date | Event | Details |
|---|------|-------|---------|
| 1 | 2012-04-12 | `birth` | Litter of 6 born to dam "Mumsy-Doo," sire "Dada-Doo." Brooklyn, NY. |
| 2 | 2012-06-20 | `vet_visit_wellness` | First puppy exam, fecal float, broad-spectrum dewormer. |
| 3 | 2012-07-15 | `vaccination` | DHPP #1. Weight 7.2 kg. |
| 4 | 2012-08-02 | `adoption` | Adopted by Norville "Shaggy" Rogers. Owner age 17 — guardian co-signed. |
| 5 | 2012-08-10 | `microchip_implant` | Chip `985-112-345-678-901`, ISO 11784. |
| 6 | 2012-08-25 | `vaccination` | DHPP #2 + rabies (primary). |
| 7 | 2012-10-15 | `behavior_therapy_start` | Puppy class — discharge note: "highly trainable when treats present, otherwise non-responsive." |
| 8 | 2013-01-20 | `vet_visit_illness` ⚑ | ER — ingested entire 1.4kg carton of "Scooby Snacks." Mild gastroenteritis, IV fluids. |
| 9 | 2013-03-15 | `vet_visit_wellness` | Annual exam. Weight 38 kg. |
| 10 | 2013-06-10 | `behavior_incident` ⚑ | First documented panic episode — abandoned amusement park, Coolsville. Reported by Mystery Inc co-handler V. Dinkley. |
| 11 | 2013-09-22 | `vet_visit_injury` ⚑ | Bite wound, left flank, 4 sutures. Reported source: "ghost dog." Wildlife capture report filed; no rabies exposure confirmed. |
| 12 | 2014-02-10 | `credential_issued` | MiMAR credential `DIM-SCDO-0001` issued. |
| 13 | 2014-05-18 | `lost_report` ⚑ | Separated from owner at Black Bayou Campground, LA. Last seen fleeing "swamp creature." |
| 14 | 2014-05-21 | `found_report` | Recovered in Lafayette via public QR scan at gas station. |
| 15 | 2014-07-12 | `vaccination` | Annual boosters. |
| 16 | 2014-10-31 | `vet_visit_injury` | Glass fragment, right ear pinna. Removed under sedation. |
| 17 | 2015-04-20 | `medication_start` ⚑ | Fluoxetine 20 mg PO SID for anxiety. |
| 18 | 2015-07-09 | `foster_in` ⚑ | Cousin "Scooby-Dum" temporary co-residence (14 days) — shared feeding plan logged. |
| 19 | 2015-09-12 | `scan_public` | Credential QR scanned at Crystal Cove Resort intake. |
| 20 | 2016-01-15 | `surgery` ⚑ | Exploratory laparotomy — foreign body retrieval (one (1) brass house key). |
| 21 | 2016-04-04 | `dental` | Full prophylaxis, two extractions. |
| 22 | 2016-06-22 | `foster_in` ⚑ | Nephew "Scrappy-Doo" 30-day co-residence; behavioral conflict noted. |
| 23 | 2016-11-09 | `travel_record` | Interstate crossing logged OH → PA via toll-booth scan. |
| 24 | 2017-02-14 | `behavior_incident` ⚑ | Acute panic — "Pterodactyl Ghost" mystery, Wichita KS. Sedated overnight at local clinic. |
| 25 | 2017-05-30 | `weight_check` | 41 kg. Caloric plan adjusted; switched to large-breed senior formula early. |
| 26 | 2017-09-01 | `insurance_enrollment` | Pet insurance policy `MASCOTAS-AR-77821`. |
| 27 | 2018-03-20 | `bite_report` ⚑ | Provocation bite (no skin break) on theatrical actor in costume. Filed with local DCO. |
| 28 | 2018-08-11 | `vet_visit_illness` | Suspected narcolepsy ruled out via overnight observation. |
| 29 | 2018-12-05 | `allergy_diagnosis` ⚑ | Shellfish anaphylaxis after dockside incident. Epinephrine auto-injector prescribed. |
| 30 | 2019-04-15 | `vaccination` | Annual boosters + leptospirosis. |
| 31 | 2019-07-22 | `lost_report` | 3-day absence in Atchafalaya. |
| 32 | 2019-07-25 | `found_report` | Recovered via public scan at convenience store. |
| 33 | 2019-11-02 | `imaging` | Hip X-rays — mild bilateral dysplasia. |
| 34 | 2019-11-10 | `medication_start` | Meloxicam 0.1 mg/kg PO SID. |
| 35 | 2020-03-30 | `vet_visit_wellness` | Telemedicine consult — anxiety re-evaluation during pandemic restrictions. |
| 36 | 2020-09-14 | `vaccination` | Boosters. |
| 37 | 2020-12-25 | `vet_visit_illness` ⚑ | Chocolate toxicity — 200 g dark chocolate ingested. Apomorphine emesis, 24 h obs. |
| 38 | 2021-04-12 | `vet_visit_wellness` | 9th birthday exam — shoulder mass biopsied. |
| 39 | 2021-04-18 | `lab_work` | Biopsy result: benign lipoma. |
| 40 | 2021-08-08 | `surgery` | Lipoma excision. |
| 41 | 2021-08-15 | `vet_visit_illness` | Surgical site infection day 7; cephalexin 14 d. |
| 42 | 2022-01-19 | `lab_work` | Senior panel — BUN/creatinine borderline. Renal-support diet begun. |
| 43 | 2022-06-05 | `behavior_therapy_start` | Phobia regression therapy after Coolsville High incident. |
| 44 | 2023-02-22 | `foster_out` ⚑ | Owner hospitalized; pet placed in foster with V. Dinkley for 6 days. |
| 45 | 2023-09-17 | `vaccination` | Annual boosters. |
| 46 | 2024-04-30 | `vet_visit_wellness` | Grade II/VI cardiac murmur detected; echo normal. |
| 47 | 2024-10-31 | `vet_visit_injury` | Sprained tail — Halloween costume entanglement. |
| 48 | 2025-03-04 | `vet_visit_injury` | Corneal ulcer OD; topical antibiotics + cone 10 d. |
| 49 | 2025-11-11 | `weight_check` | 36 kg, geriatric sarcopenia; physiotherapy referral. |
| 50 | 2026-04-12 | `vet_visit_wellness` | 14th birthday senior wellness panel. |
| 51 | 2026-05-02 | `behavior_therapy_start` | Cognitive dysfunction screening — early signs. |

**Uncommon events tagged: 14** (rows 8, 10, 11, 13, 17, 18, 20, 22, 24, 27, 29, 37, 44, plus others)

---

## 2. Brian Griffin  ·  White Labrador-mix  ·  Male

- **Aliases:** Brian H. Griffin
- **Color/coat:** White
- **Owner of record:** Peter Griffin (Quahog, RI)
- **Microchip:** None initially; implanted retroactively in 2014 ⚑
- **Public token (test):** `DIM-BRGR-0002`
- **Known conditions:** Alcohol use disorder (in remission/relapse cycles), generalized anxiety, multiple posthumous-then-revived records.
- **Notable:** Death and resurrection both logged. Useful for testing "post-mortem reactivation" edge case.

| # | Date | Event | Details |
|---|------|-------|---------|
| 1 | 1999-07-04 | `birth` | Estimated DOB; litter unknown. |
| 2 | 1999-09-12 | `intake` ⚑ | Found stray outside Quahog Quick-Stop; brought home by P. Griffin without paperwork. |
| 3 | 1999-09-13 | `adoption` | Informal owner record opened. |
| 4 | 1999-11-20 | `vaccination` | DHPP + rabies (catch-up, age-estimated). |
| 5 | 2000-02-14 | `vet_visit_illness` | Kennel cough — doxycycline 10 d. |
| 6 | 2001-05-09 | `behavior_incident` ⚑ | Found drinking martinis at Drunken Clam; first documented intoxication. |
| 7 | 2002-08-30 | `vet_visit_wellness` | Annual exam. Weight 22 kg. |
| 8 | 2003-04-18 | `medication_start` ⚑ | Anti-anxiety SSRI begun (off-label). |
| 9 | 2004-06-22 | `dental` | Tartar removal. |
| 10 | 2005-10-31 | `vet_visit_injury` | Bite wound, R foreleg — altercation with neighbor's bird. |
| 11 | 2006-03-15 | `behavior_therapy_start` ⚑ | Outpatient alcohol-use counseling (canine adaptation program). |
| 12 | 2007-09-09 | `vaccination` | Boosters. |
| 13 | 2008-04-02 | `vet_visit_illness` | Acute pancreatitis after Thanksgiving leftovers. 3 d hospital. |
| 14 | 2008-07-12 | `behavior_incident` ⚑ | Public intoxication report filed with Quahog PD; no charges (canine). |
| 15 | 2009-02-19 | `lost_report` | 4-day disappearance — found at writers' retreat in Vermont. |
| 16 | 2009-02-23 | `found_report` | Recovered. |
| 17 | 2009-12-25 | `vet_visit_injury` | Lacerations from sled accident with infant Griffin. |
| 18 | 2010-05-10 | `medication_stop` | SSRI discontinued — patient-driven. |
| 19 | 2010-09-30 | `vet_visit_illness` | Hepatic enzymes elevated; alcohol counseling referral renewed. |
| 20 | 2011-04-08 | `dental` | Full prophylaxis + 1 extraction. |
| 21 | 2011-11-17 | `vet_visit_wellness` | Annual exam. Weight 24.5 kg. |
| 22 | 2012-06-14 | `behavior_therapy_start` | Court-ordered after public-intox citation (handler held responsible). |
| 23 | 2012-10-02 | `vaccination` | Boosters. |
| 24 | 2013-03-19 | `imaging` ⚑ | Abdominal ultrasound — fatty liver, no masses. |
| 25 | 2013-08-04 | `vet_visit_illness` | Recurrent pancreatitis; low-fat prescription diet. |
| 26 | 2013-11-24 | `death` ⚑ | Hit by automobile on residential street, Quahog. DOA at clinic. |
| 27 | 2013-11-25 | `credential_revoked` | Credential `DIM-BRGR-0002` set to status `deceased`. |
| 28 | 2013-11-26 | `posthumous_record` | Cremation order; ashes returned to owner. |
| 29 | 2013-12-15 | `resurrection` ⚑ | Record reopened — confirmed live identity via DNA match. Edge-case "ressurection" event logged for testing. |
| 30 | 2013-12-16 | `credential_renewed` | Credential reactivated with continuity note. |
| 31 | 2014-01-10 | `microchip_implant` ⚑ | First-ever chip implanted (post-resurrection compliance). |
| 32 | 2014-04-22 | `vet_visit_wellness` | Post-trauma exam. |
| 33 | 2014-09-15 | `vaccination` | Catch-up DHPP + rabies. |
| 34 | 2015-06-30 | `vet_visit_illness` | Suspected drug interaction — incident at New Year's; gastric lavage. |
| 35 | 2016-02-14 | `behavior_incident` ⚑ | Bit a TV producer during book-tour signing; bite report filed. |
| 36 | 2016-08-19 | `surgery` | Mass removal, R shoulder; histopath benign. |
| 37 | 2017-04-25 | `dental` | Cleaning. |
| 38 | 2018-01-30 | `vaccination` | Boosters + leptospirosis. |
| 39 | 2018-11-05 | `lab_work` | Senior wellness — TSH low, levothyroxine started. |
| 40 | 2019-03-18 | `medication_start` | Levothyroxine 0.4 mg PO BID. |
| 41 | 2019-09-22 | `behavior_therapy_start` ⚑ | Inpatient rehab — 28-day program. |
| 42 | 2020-04-01 | `vet_visit_wellness` | Telemed exam. |
| 43 | 2021-06-10 | `imaging` | Echocardiogram — mild MV regurgitation. |
| 44 | 2022-02-14 | `vet_visit_injury` | Slip-and-fall, fractured nail. |
| 45 | 2023-07-04 | `weight_check` | 25.8 kg, BCS 6/9. |
| 46 | 2024-05-15 | `lab_work` | Liver enzymes elevated; SAMe + milk thistle. |
| 47 | 2025-11-20 | `vet_visit_illness` | Vestibular episode — resolved with supportive care. |
| 48 | 2026-04-30 | `vet_visit_wellness` | 26-year-old (in-universe) wellness exam — geriatric panel. |

**Uncommon events tagged: 11**

---

## 3. Santa's Little Helper  ·  Greyhound  ·  Male

- **Aliases:** SLH, "Santa's Little Helper"
- **Color/coat:** Brown brindle
- **Owner of record:** Homer J. Simpson (Springfield)
- **Microchip:** `900-088-100-200-300`
- **Public token (test):** `DIM-SLHP-0003`
- **Notable:** Former racing greyhound; abandonment intake; large-litter case; multiple foster/return cycles.

| # | Date | Event | Details |
|---|------|-------|---------|
| 1 | 1987-05-01 | `birth` | At "Sunny Run" racing kennel. Tattoo `GR-7437`. |
| 2 | 1989-12-24 | `intake` ⚑ | Track abandonment — fired from "Springfield Downs" mid-race ("She's the Fastest" was a hit). Owner relinquished on the spot. |
| 3 | 1989-12-24 | `adoption` | Acquired by H. & B. Simpson. |
| 4 | 1989-12-26 | `vet_visit_wellness` | Intake exam — emaciation, BCS 2/9. |
| 5 | 1990-01-14 | `vaccination` | Catch-up DHPP + rabies. |
| 6 | 1990-02-08 | `microchip_implant` | Chip implanted. |
| 7 | 1990-06-19 | `vet_visit_injury` | Paw pad laceration — broken glass. |
| 8 | 1991-04-22 | `vet_visit_illness` ⚑ | Gastric dilatation-volvulus (GDV) — emergency gastropexy. |
| 9 | 1991-04-23 | `surgery` | Splenectomy concurrent. |
| 10 | 1992-03-10 | `vaccination` | Annual boosters. |
| 11 | 1993-07-15 | `behavior_incident` ⚑ | Bit son (M. Simpson) on hand during ear pull — no charges, behavioral consult. |
| 12 | 1994-05-20 | `foster_out` ⚑ | Briefly given away to Mr. Burns for hunting use (3 d), returned. |
| 13 | 1995-10-30 | `vet_visit_wellness` | Annual. |
| 14 | 1996-02-14 | `dna_test` ⚑ | Paternity test confirmed — sired 25 puppies on dam "She's the Fastest." |
| 15 | 1996-02-28 | `posthumous_record` | (Litter event) 25 of 25 puppies relocated; whereabouts: Mr. Burns estate (later recovered). |
| 16 | 1996-03-15 | `behavior_therapy_start` | Post-litter behavior counseling. |
| 17 | 1997-08-12 | `lost_report` | 2-day absence; storm. |
| 18 | 1997-08-14 | `found_report` | Recovered at Kwik-E-Mart parking lot. |
| 19 | 1998-11-05 | `spay_neuter` ⚑ | Castration — delayed due to prior breeding history. |
| 20 | 1999-06-22 | `dental` | Prophylaxis + 3 extractions. |
| 21 | 2000-04-04 | `vaccination` | Boosters. |
| 22 | 2001-10-15 | `vet_visit_injury` | Fall from second story chasing cat; tibial fracture. |
| 23 | 2001-10-16 | `surgery` | ORIF tibia. |
| 24 | 2002-03-22 | `imaging` | Implant removal X-rays — healed. |
| 25 | 2003-05-30 | `vet_visit_illness` | Bloat (recurrence concern) — gastropexy intact, no rotation. |
| 26 | 2004-02-14 | `medication_start` | Carprofen for chronic arthritis. |
| 27 | 2005-09-09 | `vaccination` | Boosters. |
| 28 | 2006-06-18 | `lost_report` ⚑ | 11-day absence — joined feral pack; recovered by ASPCA. |
| 29 | 2006-06-29 | `found_report` | Returned via chip scan. |
| 30 | 2007-01-10 | `behavior_therapy_start` ⚑ | Police K9 trial (briefly trained as drug-detection canine); discharged for low motivation. |
| 31 | 2008-12-25 | `vet_visit_illness` | Dietary indiscretion — ham bone fragment, conservative management. |
| 32 | 2009-04-04 | `dental` | Cleaning. |
| 33 | 2010-08-19 | `lab_work` | Senior panel — kidney values stable. |
| 34 | 2011-11-11 | `vet_visit_wellness` | 24th birthday senior exam (in-universe). |
| 35 | 2012-05-15 | `vet_visit_illness` | URI — supportive care. |
| 36 | 2013-09-20 | `surgery` ⚑ | Mast cell tumor excision, R flank; grade I, margins clean. |
| 37 | 2014-04-30 | `imaging` | Chest X-rays — no metastasis. |
| 38 | 2015-10-10 | `medication_start` | Gabapentin for chronic pain. |
| 39 | 2016-07-04 | `vet_visit_injury` ⚑ | Burns to coat from fireworks; topical care + Elizabethan collar. |
| 40 | 2017-12-12 | `vaccination` | Boosters (limited senior protocol). |
| 41 | 2018-08-25 | `weight_check` | 28 kg, mild sarcopenia. |
| 42 | 2019-03-30 | `lab_work` | T4 low, levothyroxine started. |
| 43 | 2020-02-22 | `vet_visit_illness` ⚑ | Vestibular disease — peripheral, resolved in 14 d. |
| 44 | 2021-06-11 | `dental` | Limited cleaning under sedation. |
| 45 | 2022-09-14 | `vet_visit_illness` | Cognitive dysfunction signs; selegiline prescribed. |
| 46 | 2023-10-01 | `medication_start` | Selegiline 0.5 mg/kg PO SID. |
| 47 | 2024-07-19 | `vet_visit_wellness` | Quality-of-life assessment, ongoing. |
| 48 | 2025-12-24 | `vet_visit_wellness` | 36-year-in-universe wellness (cartoon time is forgiving). |

**Uncommon events tagged: 11**

---

## 4. Snoopy  ·  Beagle  ·  Male

- **Aliases:** "Joe Cool," "The World-Famous Flying Ace" (handler-reported personas)
- **Color/coat:** White with black ears/back
- **Owner of record:** Charlie Brown (formerly Lila — see record #4)
- **Microchip:** `985-200-100-555-100`
- **Public token (test):** `DIM-SNPY-0004`
- **Notable:** Multi-owner history with retroactive ownership transfer documentation; large sibling network logged.

| # | Date | Event | Details |
|---|------|-------|---------|
| 1 | 2010-08-10 | `birth` | Daisy Hill Puppy Farm. Litter of 8: Spike, Belle, Marbles, Olaf, Andy, Rover, Molly, Snoopy. |
| 2 | 2010-10-22 | `vaccination` | DHPP #1. |
| 3 | 2010-11-15 | `adoption` ⚑ | Initial adoption by **Lila** (first owner of record). |
| 4 | 2010-11-20 | `microchip_implant` | Chip implanted. |
| 5 | 2011-02-03 | `ownership_transfer` ⚑ | Returned to Daisy Hill — owner moved to apartment with no-pet policy. |
| 6 | 2011-02-08 | `adoption` | Adopted by **Charlie Brown** (current owner of record). |
| 7 | 2011-03-12 | `vet_visit_wellness` | First exam under new owner. |
| 8 | 2011-04-04 | `vaccination` | DHPP #2 + rabies. |
| 9 | 2011-07-04 | `behavior_incident` ⚑ | Found atop doghouse roof simulating WW1 aerial combat — handler advised dismount. |
| 10 | 2012-01-20 | `vet_visit_illness` | Gastric upset — dietary indiscretion (pizza crust). |
| 11 | 2012-06-15 | `weight_check` | 9 kg — note "puppy chunk." |
| 12 | 2013-03-18 | `dental` | First scaling. |
| 13 | 2013-09-09 | `vaccination` | Annual boosters. |
| 14 | 2014-05-22 | `lost_report` | Wandered during family trip. |
| 15 | 2014-05-23 | `found_report` | Returned next day via QR scan. |
| 16 | 2014-12-25 | `vet_visit_injury` ⚑ | Holiday-light entanglement; minor abrasions. |
| 17 | 2015-04-14 | `vet_visit_wellness` | Annual. |
| 18 | 2016-08-08 | `behavior_incident` | Refused to recognize own name "Snoopy" — preferred "Joe Cool" per owner. |
| 19 | 2016-10-31 | `behavior_therapy_start` | Identity-flexibility consult; benign finding. |
| 20 | 2017-03-30 | `vaccination` | Boosters. |
| 21 | 2017-08-12 | `vet_visit_illness` ⚑ | Allergic dermatitis — kapok stuffing exposure (doghouse fire). |
| 22 | 2018-01-15 | `vet_visit_injury` ⚑ | Doghouse fire (electrical); smoke inhalation observation 24 h. |
| 23 | 2018-04-04 | `imaging` | Chest X-rays — clear. |
| 24 | 2018-09-10 | `weight_check` | 11.4 kg, BCS 7/9; portion control plan. |
| 25 | 2019-02-14 | `vet_visit_illness` | Suspected gastritis. |
| 26 | 2019-06-30 | `vet_visit_wellness` | Annual + ophthalmic exam. |
| 27 | 2019-12-12 | `foster_out` ⚑ | Owner attending summer camp — fostered 14 d by Linus Van Pelt's family. |
| 28 | 2020-03-22 | `vaccination` | Boosters. |
| 29 | 2020-08-15 | `behavior_incident` ⚑ | Conducted unauthorized Beagle Scouts overnight in neighbor's yard. |
| 30 | 2021-01-04 | `vet_visit_injury` | Skating-rink incident — sprained R hock. |
| 31 | 2021-05-18 | `dental` | Cleaning + 1 extraction. |
| 32 | 2022-02-02 | `lab_work` | Senior panel; ALT mildly elevated. |
| 33 | 2022-07-09 | `medication_start` ⚑ | SAMe + UDCA for hepatic support. |
| 34 | 2023-03-15 | `vaccination` | Limited senior protocol. |
| 35 | 2023-10-31 | `vet_visit_injury` | Fall from doghouse roof — bruised tail base. |
| 36 | 2024-04-22 | `imaging` | Abdominal US — no masses. |
| 37 | 2024-09-12 | `vet_visit_illness` ⚑ | Companion-bird ("Woodstock") death incident — situational depression; behavioral support. |
| 38 | 2024-12-25 | `vet_visit_wellness` | Holiday exam. |
| 39 | 2025-03-04 | `dental` | Limited cleaning. |
| 40 | 2025-08-10 | `vet_visit_wellness` | 15th birthday senior wellness. |
| 41 | 2025-11-20 | `medication_start` | Gabapentin for chronic joint pain. |
| 42 | 2026-02-14 | `weight_check` | 10.1 kg. |
| 43 | 2026-05-10 | `vet_visit_wellness` | Quality-of-life check. |

**Uncommon events tagged: 10**

---

## 5. Odie  ·  Wire-haired Dachshund/Beagle mix  ·  Male

- **Color/coat:** Yellow/tan with brown ears
- **Owner of record:** Jon Arbuckle (Muncie, IN)
- **Previous owner:** Lyman ⚑ (whereabouts unknown — listed as `missing_person` in legacy records)
- **Microchip:** `985-300-040-040-001`
- **Public token (test):** `DIM-ODIE-0005`
- **Notable:** Original handler vanished; useful for testing "orphaned ownership chain → reassignment" workflow.

| # | Date | Event | Details |
|---|------|-------|---------|
| 1 | 2008-03-15 | `birth` | Litter unknown; shelter intake estimate. |
| 2 | 2008-06-20 | `intake` ⚑ | Shelter intake, Muncie Animal Control. |
| 3 | 2008-07-05 | `adoption` | Adopted by **Lyman** (original owner). |
| 4 | 2008-07-08 | `vaccination` | DHPP + rabies. |
| 5 | 2008-08-01 | `microchip_implant` | Chip implanted by adopting shelter. |
| 6 | 2009-04-22 | `vet_visit_wellness` | First annual. |
| 7 | 2009-10-31 | `behavior_incident` | Excessive licking — no medical cause; behavioral note. |
| 8 | 2010-02-14 | `ownership_transfer` ⚑ | Original owner (Lyman) "disappeared." Co-resident Jon Arbuckle assumes ownership de facto. Legal transfer logged retroactively. |
| 9 | 2010-03-01 | `credential_issued` | New credential after ownership reassignment. |
| 10 | 2010-06-12 | `vaccination` | Annual. |
| 11 | 2011-01-25 | `vet_visit_injury` ⚑ | Repeated falls from kitchen table; soft-tissue bruising. Welfare officer alerted (case closed, no cruelty). |
| 12 | 2011-08-09 | `vet_visit_wellness` | Annual. |
| 13 | 2012-02-14 | `dental` | First cleaning. |
| 14 | 2012-11-30 | `lost_report` ⚑ | Lost on cross-country drive ("Garfield's Pet Force" merch tour). |
| 15 | 2012-12-04 | `found_report` | Recovered 4 days later via QR scan at truck stop, NM. |
| 16 | 2013-05-20 | `vet_visit_illness` | Gastroenteritis. |
| 17 | 2013-09-09 | `vaccination` | Annual. |
| 18 | 2014-04-04 | `vet_visit_injury` ⚑ | Co-pet ("Garfield," cat, F. domesticus) aggression incident; minor lacerations. Bite report not filed (intra-household). |
| 19 | 2014-10-22 | `behavior_therapy_start` | Co-pet conflict resolution sessions. |
| 20 | 2015-02-14 | `vet_visit_wellness` | Annual. |
| 21 | 2015-06-30 | `weight_check` | 12 kg. |
| 22 | 2016-01-10 | `lost_report` ⚑ | "Lost on TV broadcast" — left at studio during live segment; recovery routed through broadcast network. |
| 23 | 2016-01-12 | `found_report` | Returned via news ticker. |
| 24 | 2016-08-15 | `vaccination` | Boosters. |
| 25 | 2017-04-22 | `vet_visit_illness` | Allergic reaction — bee sting, supportive care. |
| 26 | 2017-09-09 | `dental` | Cleaning + 2 extractions. |
| 27 | 2018-03-30 | `vet_visit_injury` ⚑ | Tongue laceration from chronic licking habit; surgical repair under sedation. |
| 28 | 2018-11-11 | `vaccination` | Annual. |
| 29 | 2019-06-15 | `imaging` | Spinal X-rays (dachshund precaution) — mild disc narrowing L1-L2. |
| 30 | 2019-10-31 | `vet_visit_injury` ⚑ | IVDD episode; conservative management + crate rest. |
| 31 | 2020-02-14 | `medication_start` | Gabapentin + meloxicam. |
| 32 | 2020-08-08 | `behavior_incident` ⚑ | Repeatedly retrieved cat from rooftop; municipal climbing-incident report. |
| 33 | 2020-12-25 | `vet_visit_wellness` | Holiday exam. |
| 34 | 2021-05-20 | `vaccination` | Boosters. |
| 35 | 2021-10-30 | `dental` | Limited cleaning. |
| 36 | 2022-03-15 | `vet_visit_illness` | URI — supportive care. |
| 37 | 2022-08-12 | `lab_work` | Senior panel — within normal limits. |
| 38 | 2023-02-14 | `behavior_therapy_start` | Renewed co-pet conflict counseling after escalation. |
| 39 | 2023-09-09 | `vaccination` | Annual. |
| 40 | 2024-04-22 | `vet_visit_injury` ⚑ | Cat-related fall into birthday cake; dermatitis from frosting. |
| 41 | 2024-10-15 | `weight_check` | 13.5 kg, BCS 6/9. |
| 42 | 2025-03-30 | `vet_visit_wellness` | Annual. |
| 43 | 2025-11-25 | `dental` | Cleaning. |
| 44 | 2026-04-10 | `vet_visit_wellness` | 18-year senior wellness. |

**Uncommon events tagged: 11**

---

## 6. Bolt  ·  White Swiss Shepherd  ·  Male

- **Color/coat:** White
- **Owner of record:** Penny Forrester (Hollywood, CA)
- **Microchip:** `985-400-555-666-777`
- **Public token (test):** `DIM-BOLT-0006`
- **Notable:** Long-term commercial captivity → cross-country lost arc → reunion. Useful for testing **jurisdiction_transfer** chains and **scan_public** burst events.

| # | Date | Event | Details |
|---|------|-------|---------|
| 1 | 2015-09-01 | `birth` | Farm in Bakersfield, CA. |
| 2 | 2015-10-30 | `vaccination` | DHPP #1. |
| 3 | 2015-11-15 | `adoption` | Adopted at 8 weeks by Penny Forrester. |
| 4 | 2015-11-16 | `microchip_implant` | Chip implanted. |
| 5 | 2015-12-04 | `vaccination` | DHPP #2 + rabies. |
| 6 | 2016-02-10 | `ownership_transfer` ⚑ | Provisional transfer to "MGM Studios — Production Unit 7" for TV-series filming; biological owner remains Penny. |
| 7 | 2016-03-15 | `behavior_therapy_start` ⚑ | Method-acting conditioning protocol (canine variant) — for testing record of unusual training regimes. |
| 8 | 2016-08-09 | `vet_visit_wellness` | First annual on set. |
| 9 | 2017-04-22 | `vaccination` | Annual. |
| 10 | 2017-09-30 | `vet_visit_injury` | Burn on R paw — stage pyrotechnics. |
| 11 | 2018-05-04 | `weight_check` | 24 kg. |
| 12 | 2018-11-11 | `dental` | Cleaning. |
| 13 | 2019-03-15 | `vaccination` | Annual. |
| 14 | 2019-08-20 | `vet_visit_illness` ⚑ | Suspected psychosomatic loss of "super-strength" (handler report); referred to behavior. |
| 15 | 2020-02-14 | `lost_report` ⚑ | Escaped studio set after live-broadcast accident. Cross-country journey begins. |
| 16 | 2020-02-15 | `scan_public` ⚑ | Public QR scan — Las Vegas, NV. (First of 9-state recovery burst.) |
| 17 | 2020-02-19 | `scan_public` | Public QR scan — Cedar City, UT. |
| 18 | 2020-02-22 | `scan_public` | Public QR scan — Denver, CO. |
| 19 | 2020-02-26 | `scan_public` | Public QR scan — Lincoln, NE. |
| 20 | 2020-03-01 | `scan_public` | Public QR scan — Des Moines, IA. |
| 21 | 2020-03-05 | `scan_public` | Public QR scan — Chicago, IL. |
| 22 | 2020-03-09 | `scan_public` | Public QR scan — Cleveland, OH. |
| 23 | 2020-03-12 | `scan_public` | Public QR scan — Pittsburgh, PA. |
| 24 | 2020-03-16 | `scan_public` ⚑ | Public QR scan — Hoboken, NJ. (Final scan before recovery — sustained 9-scan trail.) |
| 25 | 2020-03-18 | `found_report` ⚑ | Recovered in Hoboken via Good Samaritan; cross-country recovery confirmed. |
| 26 | 2020-03-20 | `foster_in` ⚑ | Temporary foster en-route (M. "Mittens," F. domesticus, co-resident). Foster log includes inter-species cohabitation note. |
| 27 | 2020-03-25 | `travel_record` | Interstate return transport NJ → CA. |
| 28 | 2020-04-04 | `vet_visit_wellness` | Reunion exam — emaciated (BCS 3/9), road exposure. |
| 29 | 2020-04-05 | `lab_work` ⚑ | CBC/chem + heartworm test (positive — `D. immitis` antigen+). |
| 30 | 2020-04-12 | `medication_start` ⚑ | Heartworm treatment — melarsomine protocol (American Heartworm Society 3-injection regimen). |
| 31 | 2020-06-30 | `imaging` | Chest rads post-treatment. |
| 32 | 2020-08-15 | `lab_work` | Heartworm antigen negative. |
| 33 | 2020-12-04 | `behavior_therapy_start` ⚑ | "Reality reorientation" therapy — desensitization to non-cinematic stimuli. |
| 34 | 2021-03-30 | `vaccination` | Boosters. |
| 35 | 2021-09-09 | `dental` | Cleaning. |
| 36 | 2022-02-14 | `vet_visit_wellness` | Annual. |
| 37 | 2022-08-22 | `vet_visit_injury` | Sprained shoulder — herding the resident hamster ("Rhino"). |
| 38 | 2023-04-04 | `weight_check` | 26 kg, BCS 5/9. |
| 39 | 2023-09-30 | `vaccination` | Annual. |
| 40 | 2024-03-15 | `imaging` | Hip radiographs — mild OA. |
| 41 | 2024-08-08 | `medication_start` | Carprofen 2 mg/kg PO BID. |
| 42 | 2025-04-22 | `dental` | Cleaning. |
| 43 | 2025-10-10 | `vet_visit_wellness` | Annual. |
| 44 | 2026-04-30 | `vet_visit_wellness` | 11th-year senior assessment. |

**Uncommon events tagged: 10** (rows 6, 7, 14, 15, 25, 26, 30 + dense public-scan burst 16–24 which is its own uncommon pattern)

---

## 7. Puss in Boots  ·  Domestic Shorthair  ·  Male

- **Aliases:** "Diablo Gato," "Frisky Two-Times"
- **Color/coat:** Orange tabby
- **Owner of record:** None — independent custody, fostered by various households
- **Microchip:** Not implanted ⚑ (record-keeping edge case)
- **Public token (test):** `DIM-PUSS-0007`
- **Notable:** Multiple near-death encounters; useful for testing **"life remaining" custom counter** and **untagged-animal scan** flow.

| # | Date | Event | Details |
|---|------|-------|---------|
| 1 | 2012-06-20 | `birth` | San Ricardo (jurisdiction = ES). |
| 2 | 2012-07-10 | `intake` ⚑ | Orphanage intake — dam deceased, sire unknown. |
| 3 | 2012-09-15 | `foster_in` | Imelda's household (foster_in #1). |
| 4 | 2012-11-20 | `vaccination` | FVRCP. |
| 5 | 2013-04-04 | `vet_visit_wellness` | Kitten exam. |
| 6 | 2013-08-12 | `behavior_therapy_start` ⚑ | Hero-orientation conditioning (informal). |
| 7 | 2014-02-22 | `vet_visit_injury` ⚑ | Near-fall from cathedral bell tower — Life #1 expended. Severe but recovered. |
| 8 | 2014-09-09 | `bite_report` | Sword-related laceration to ear; not a bite per se, but logged. |
| 9 | 2015-03-15 | `jurisdiction_transfer` ⚑ | ES → "Far Far Away Kingdom" (unrecognized jurisdiction; flagged for manual review). |
| 10 | 2015-04-22 | `vaccination` | Catch-up vaccinations. |
| 11 | 2015-08-30 | `behavior_incident` | Branded as outlaw — record annotated by foreign jurisdiction. |
| 12 | 2016-01-10 | `vet_visit_injury` | Sword-fight laceration L flank. Life #2 expended ⚑. |
| 13 | 2016-07-04 | `lost_report` | Wanted poster issued (foreign jurisdiction). |
| 14 | 2017-02-14 | `found_report` | Voluntarily turned in. |
| 15 | 2017-09-20 | `vet_visit_illness` | Hairball impaction; supportive care. |
| 16 | 2018-04-04 | `vet_visit_injury` | Crushed by chandelier. Life #3 expended ⚑. |
| 17 | 2018-10-10 | `dental` | Cleaning. |
| 18 | 2019-03-15 | `vaccination` | Annual. |
| 19 | 2019-08-22 | `vet_visit_injury` | Drowning incident — pulled from river. Life #4 expended ⚑. |
| 20 | 2020-02-14 | `vet_visit_wellness` | Annual. |
| 21 | 2020-07-19 | `weight_check` | 5.8 kg. |
| 22 | 2020-12-25 | `vet_visit_injury` | Fall from giant beanstalk — multiple injuries. Life #5 expended ⚑. |
| 23 | 2021-03-10 | `imaging` | Whole-body rads — old fractures consistent with falls. |
| 24 | 2021-06-30 | `vet_visit_illness` | Anorexia — stress-related; appetite stimulant. |
| 25 | 2021-09-15 | `vet_visit_injury` | Trampled by ogre. Life #6 expended ⚑. |
| 26 | 2022-01-22 | `behavior_therapy_start` | PTSD-like response post-multiple-trauma. |
| 27 | 2022-05-30 | `vet_visit_injury` | Crushed by giant — Life #7 expended ⚑. |
| 28 | 2022-09-09 | `vet_visit_illness` | Suspected cardiac event — collapsed during duel. Life #8 expended ⚑. Echocardiogram inconclusive. |
| 29 | 2022-09-15 | `behavior_incident` ⚑ | First documented encounter with "the Wolf" (panic-attack record). |
| 30 | 2022-10-22 | `medication_start` | Fluoxetine for trauma response. |
| 31 | 2023-02-14 | `behavior_therapy_start` | Existential-counseling sessions (only one life remaining). |
| 32 | 2023-06-30 | `lost_report` | Wandered during quest. |
| 33 | 2023-08-12 | `found_report` | Recovered via informal network (no chip — manual ID confirmation). |
| 34 | 2024-01-15 | `vet_visit_wellness` | Annual exam. |
| 35 | 2024-05-22 | `dental` | Cleaning. |
| 36 | 2024-09-30 | `weight_check` | 5.3 kg. |
| 37 | 2025-02-14 | `vaccination` | Annual. |
| 38 | 2025-06-10 | `behavior_therapy_start` | Resilience-and-acceptance therapy (final life). |
| 39 | 2025-10-31 | `vet_visit_injury` | Minor — claw injury. No life lost. |
| 40 | 2026-01-22 | `microchip_implant` ⚑ | Retroactive chip implant — agreed to record-keeping after life-count near-miss. |
| 41 | 2026-02-28 | `credential_issued` | Credential `DIM-PUSS-0007` issued post-implant. |
| 42 | 2026-04-04 | `vet_visit_wellness` | Annual exam. |
| 43 | 2026-05-10 | `dental` | Cleaning. |

**Uncommon events tagged: 12**

---

## 8. Tom  ·  Domestic Shorthair  ·  Male

- **Color/coat:** Blue-grey & white
- **Owner of record:** Multiple sequential — see ownership chain
- **Microchip:** `985-500-700-700-700`
- **Public token (test):** `DIM-TOMC-0008`
- **Notable:** Extreme injury history; multiple "DOA-then-recovered" entries; serial-owner edge case.

| # | Date | Event | Details |
|---|------|-------|---------|
| 1 | 2009-08-12 | `birth` | Estimated. Stray litter. |
| 2 | 2009-10-15 | `intake` | Animal control intake. |
| 3 | 2009-11-01 | `adoption` ⚑ | First owner: Mammy Two Shoes household. |
| 4 | 2009-11-15 | `vaccination` | FVRCP + rabies. |
| 5 | 2009-12-04 | `microchip_implant` | Chip implanted. |
| 6 | 2010-03-22 | `vet_visit_injury` ⚑ | Blunt trauma to head — frying-pan incident. Concussion. |
| 7 | 2010-06-30 | `vet_visit_injury` | Tail crushed in door. Conservative management. |
| 8 | 2010-09-09 | `vet_visit_wellness` | Annual. |
| 9 | 2011-02-14 | `vet_visit_injury` | Electrical burn — household appliance contact. |
| 10 | 2011-07-04 | `vet_visit_injury` ⚑ | Pyrotechnic incident — singed coat, partial-thickness burns. |
| 11 | 2011-11-25 | `ownership_transfer` ⚑ | Owner moved; cat re-homed to next household. |
| 12 | 2012-02-14 | `vet_visit_injury` | Hammer trauma (R foreleg). |
| 13 | 2012-05-30 | `imaging` | Skeletal survey — chronic-trauma pattern noted. |
| 14 | 2012-09-09 | `behavior_therapy_start` ⚑ | Predator-conflict counseling (chronic conflict with rodent co-resident). |
| 15 | 2013-04-22 | `vaccination` | Annual. |
| 16 | 2013-08-15 | `vet_visit_injury` | Vacuum-cleaner aspiration injury — recovered. |
| 17 | 2013-12-12 | `vet_visit_injury` ⚑ | Flattened by piano — multiple rib fractures. Hospitalized 9 d. |
| 18 | 2014-04-04 | `imaging` | Recheck rads — healing. |
| 19 | 2014-09-30 | `dental` | Cleaning + 2 extractions. |
| 20 | 2015-02-14 | `vet_visit_illness` | Suspected mild head trauma sequelae. |
| 21 | 2015-08-22 | `ownership_transfer` | Re-homed (owner #3). |
| 22 | 2016-01-15 | `vet_visit_injury` ⚑ | Fell from 7th-story window. Treated for shock; no fractures. ("Cat righting reflex" documented.) |
| 23 | 2016-06-30 | `lost_report` | 5 days absent. |
| 24 | 2016-07-05 | `found_report` | Recovered. |
| 25 | 2016-11-11 | `vaccination` | Boosters. |
| 26 | 2017-03-22 | `vet_visit_injury` ⚑ | Anvil-related blunt trauma — survived. |
| 27 | 2017-09-09 | `medication_start` | Gabapentin chronic pain. |
| 28 | 2018-02-14 | `vet_visit_wellness` | Annual. |
| 29 | 2018-08-08 | `weight_check` | 5.5 kg. |
| 30 | 2018-11-20 | `dental` | Cleaning. |
| 31 | 2019-04-04 | `vet_visit_injury` | Dynamite-adjacent burn. |
| 32 | 2019-09-12 | `imaging` | CT — mild chronic encephalopathy. |
| 33 | 2020-02-14 | `behavior_incident` ⚑ | "Suspected suicide attempt" entry (canon fakeout) — clinic note marked `requires_review`. |
| 34 | 2020-06-22 | `vet_visit_illness` | Anorexia, vomiting — resolved. |
| 35 | 2020-11-30 | `vaccination` | Annual. |
| 36 | 2021-04-04 | `ownership_transfer` ⚑ | Re-homed (owner #4). |
| 37 | 2021-08-15 | `vet_visit_injury` | Tail in mousetrap. |
| 38 | 2022-02-14 | `vet_visit_wellness` | Annual. |
| 39 | 2022-09-09 | `dental` | Cleaning. |
| 40 | 2023-04-22 | `lab_work` | Senior panel — CKD stage 2. |
| 41 | 2023-09-15 | `medication_start` | Renal-support diet. |
| 42 | 2024-03-30 | `vaccination` | Limited senior protocol. |
| 43 | 2024-08-08 | `vet_visit_injury` | Minor laceration — mouse retaliation. |
| 44 | 2025-04-04 | `vet_visit_wellness` | Annual. |
| 45 | 2025-11-11 | `lab_work` | CKD stage 3; subQ fluids initiated. |
| 46 | 2026-04-22 | `vet_visit_wellness` | Quality-of-life check. |

**Uncommon events tagged: 10**

---

## 9. Courage  ·  Mixed-breed (toy)  ·  Male

- **Aliases:** "Stupid dog" (per co-handler E. Bagge)
- **Color/coat:** Pink
- **Owner of record:** Muriel Bagge (Nowhere, Kansas)
- **Microchip:** None — found stray, never implanted ⚑
- **Public token (test):** `DIM-CRGE-0009`
- **Notable:** Origin story: parents reportedly "sent to space" by mad veterinarian. Extensive trauma history; useful for testing **historical animal-cruelty case linkage**.

| # | Date | Event | Details |
|---|------|-------|---------|
| 1 | 2017-04-10 | `birth` | Estimated DOB. |
| 2 | 2017-04-20 | `behavior_incident` ⚑ | Parents reportedly abducted by veterinarian (case #NW-1999-001 — historic file). Puppy abandoned in alleyway. |
| 3 | 2017-05-15 | `intake` ⚑ | Found by M. Bagge in alley; informal intake. |
| 4 | 2017-06-01 | `adoption` | Adopted; no shelter paperwork (manual records). |
| 5 | 2017-06-15 | `vet_visit_wellness` | First exam — malnutrition, BCS 2/9. |
| 6 | 2017-07-04 | `vaccination` | DHPP + rabies (catch-up). |
| 7 | 2017-09-09 | `vet_visit_illness` | URI — supportive care. |
| 8 | 2018-02-14 | `behavior_incident` ⚑ | Acute panic episode — supernatural-event report; co-handler attributed to "trick of the light." |
| 9 | 2018-05-22 | `vet_visit_injury` | Bite wound (assailant unknown — handler description "duck-shaped specter"). |
| 10 | 2018-09-30 | `vet_visit_illness` ⚑ | Possible exposure to experimental compound (Dr. "Le Quack" episode). Toxicology negative. |
| 11 | 2019-01-15 | `vaccination` | Annual. |
| 12 | 2019-04-22 | `vet_visit_injury` ⚑ | Multiple lacerations from cat ("Katz" — co-resident, animal welfare complaint filed against Katz). |
| 13 | 2019-08-08 | `behavior_therapy_start` | Trauma-focused therapy initiated. |
| 14 | 2019-11-30 | `lost_report` ⚑ | Held by unknown party in cellar 9 d. |
| 15 | 2019-12-09 | `found_report` | Recovered. |
| 16 | 2020-03-22 | `vet_visit_wellness` | Annual. |
| 17 | 2020-07-04 | `vet_visit_illness` | Suspected hallucinogen exposure (toxicology negative again — pattern flagged). |
| 18 | 2020-10-31 | `vet_visit_injury` | Tail injury — door. |
| 19 | 2021-02-14 | `weight_check` | 4.8 kg. |
| 20 | 2021-05-15 | `vaccination` | Annual. |
| 21 | 2021-09-09 | `dental` | First cleaning. |
| 22 | 2022-01-10 | `vet_visit_illness` ⚑ | Severe contact-allergic dermatitis — unidentified spider-shaped substance. |
| 23 | 2022-04-22 | `imaging` | Whole-body rads — chronic micro-fractures noted. Welfare officer interview held with M. & E. Bagge. Case closed. |
| 24 | 2022-08-30 | `behavior_therapy_start` | Continued PTSD therapy — twice-monthly sessions. |
| 25 | 2022-11-25 | `vet_visit_injury` | Fall from windmill. |
| 26 | 2023-02-14 | `vaccination` | Annual. |
| 27 | 2023-05-30 | `vet_visit_illness` | Anxiety-related anorexia; appetite stimulant. |
| 28 | 2023-09-09 | `medication_start` ⚑ | Fluoxetine 5 mg PO SID. |
| 29 | 2023-12-25 | `vet_visit_injury` | Holiday electrocution (minor); recovered. |
| 30 | 2024-03-15 | `vet_visit_wellness` | Annual. |
| 31 | 2024-06-22 | `dental` | Cleaning. |
| 32 | 2024-08-08 | `lost_report` | 3 d absence. |
| 33 | 2024-08-11 | `found_report` | Recovered. |
| 34 | 2024-11-30 | `vet_visit_illness` ⚑ | Possible exposure to mind-control substance (handler report); urine tox negative. |
| 35 | 2025-02-14 | `vaccination` | Annual. |
| 36 | 2025-05-22 | `weight_check` | 4.5 kg. |
| 37 | 2025-08-30 | `vet_visit_injury` | Bee stings (multiple). |
| 38 | 2025-11-11 | `imaging` | Echocardiogram — mild MV regurgitation. |
| 39 | 2026-01-22 | `microchip_implant` ⚑ | First chip implanted (9-year delay from intake). |
| 40 | 2026-02-14 | `credential_issued` | Credential `DIM-CRGE-0009` issued. |
| 41 | 2026-03-30 | `vet_visit_wellness` | Annual. |
| 42 | 2026-05-10 | `behavior_therapy_start` | Long-term maintenance therapy plan. |

**Uncommon events tagged: 10**

---

## 10. Blue  ·  Blue Heeler / cartoon-stylized  ·  Female

- **Aliases:** Blue
- **Color/coat:** Blue
- **Owner of record:** Currently Josh; previously Joe; originally Steve ⚑ (three-handler chain)
- **Microchip:** `985-600-101-202-303`
- **Public token (test):** `DIM-BLUE-0010`
- **Notable:** Three sequential owners with overlapping handoff periods; cohabitating pet ("Magenta," F. domesticus) with shared events; useful for testing **multi-owner record retention** and **co-pet linkage**.

| # | Date | Event | Details |
|---|------|-------|---------|
| 1 | 2014-09-08 | `birth` | Litter unknown. |
| 2 | 2014-11-15 | `adoption` ⚑ | First owner: Steve Burns. |
| 3 | 2014-11-20 | `microchip_implant` | Chip implanted. |
| 4 | 2014-12-01 | `vaccination` | DHPP. |
| 5 | 2015-03-15 | `vet_visit_wellness` | Puppy exam. |
| 6 | 2015-06-30 | `vaccination` | DHPP #2 + rabies. |
| 7 | 2015-09-22 | `behavior_therapy_start` ⚑ | "Clue-finding" cognitive enrichment program — pawprint-based puzzle task. |
| 8 | 2016-01-15 | `vaccination` | Boosters. |
| 9 | 2016-04-22 | `weight_check` | 14 kg. |
| 10 | 2016-09-09 | `vet_visit_wellness` | Annual. |
| 11 | 2017-02-14 | `dental` | First cleaning. |
| 12 | 2017-05-30 | `ownership_transfer` ⚑ | First handler (Steve) → "college" transition. Co-handler **Joe** takes over. Transition co-signed; pet temporarily lists two handlers. |
| 13 | 2017-06-15 | `credential_renewed` | Credential reissued with new handler. |
| 14 | 2017-09-30 | `vet_visit_illness` | Mild GI upset. |
| 15 | 2018-02-22 | `vaccination` | Annual. |
| 16 | 2018-06-04 | `behavior_incident` ⚑ | Disrupted recorded broadcast — non-cued bark sequence; production team flagged. |
| 16b | 2018-07-22 | `scan_public` ⚑ | Public QR scan — convention appearance. Identity confirmed by 4,000+ attendees in a single day. Throughput edge case. |
| 17 | 2018-10-31 | `vet_visit_injury` | Minor paw cut (mailbox incident). |
| 18 | 2019-03-15 | `vaccination` | Annual. |
| 19 | 2019-08-08 | `behavior_therapy_start` | Continued enrichment program. |
| 20 | 2019-12-25 | `vet_visit_wellness` | Holiday exam. |
| 21 | 2020-02-14 | `dental` | Cleaning. |
| 22 | 2020-06-09 | `lost_report` ⚑ | Briefly disappeared into "Thinking Chair" — recovered same day. |
| 23 | 2020-06-09 | `found_report` | Same-day recovery. |
| 24 | 2020-09-22 | `vaccination` | Annual. |
| 25 | 2021-02-14 | `vet_visit_illness` | URI; doxycycline. |
| 26 | 2021-05-04 | `imaging` | Hip X-rays — within normal limits. |
| 27 | 2021-08-22 | `weight_check` | 15.5 kg. |
| 28 | 2021-11-09 | `ownership_transfer` ⚑ | Joe departs production; co-handler **Josh** assumes care. Three-handler chain now in record. |
| 29 | 2021-11-15 | `credential_renewed` | Credential reissued — third handler in chain. |
| 30 | 2022-03-15 | `vaccination` | Annual. |
| 31 | 2022-07-04 | `vet_visit_injury` | Tail injury — chair leg. |
| 32 | 2022-10-31 | `behavior_incident` ⚑ | Co-pet "Magenta" (F. domesticus, co-resident) ran away briefly — joint search-and-recovery logged on Blue's record. |
| 33 | 2023-02-14 | `vet_visit_wellness` | Annual. |
| 34 | 2023-06-22 | `dental` | Cleaning + 1 extraction. |
| 35 | 2023-09-09 | `vaccination` | Annual. |
| 36 | 2024-01-15 | `lab_work` | Senior pre-screening — within normal limits. |
| 37 | 2024-04-22 | `weight_check` | 16.2 kg. |
| 38 | 2024-08-30 | `vet_visit_injury` | Slipped on wet floor; soft-tissue strain. |
| 39 | 2024-12-04 | `medication_start` ⚑ | Glucosamine + omega-3 supplementation — preventive joint care. |
| 40 | 2025-03-15 | `vaccination` | Annual. |
| 41 | 2025-07-19 | `dental` | Cleaning. |
| 42 | 2025-11-25 | `imaging` | Hip rads — mild OA early signs. |
| 43 | 2026-02-14 | `vet_visit_wellness` | 12th-year wellness. |
| 44 | 2026-05-10 | `behavior_therapy_start` ⚑ | Cognitive enrichment refresh — multi-handler-induced confusion noted; refresher recommended. |

**Uncommon events tagged: 10**

---

## Cross-pet workflow stressors (for testing)

The set as a whole exercises these complex/edge scenarios:

1. **Resurrection after declared death** — Brian (rows 26–30).
2. **Retroactive microchip implant 9+ years after intake** — Courage (row 39), Puss (row 40), Brian (row 31).
3. **Orphaned ownership chain with vanished prior owner** — Odie (row 8) and the "Lyman" case.
4. **Three-handler chain with overlap and credential reissue** — Blue (rows 12, 28).
5. **Cross-jurisdiction transfer to unrecognized authority** — Puss (row 9, "Far Far Away Kingdom").
6. **Burst of 9 public QR scans in 30 days across 9 states/cities** — Bolt (rows 16–24).
7. **Custom counter ("lives remaining") spanning years** — Puss (8 lives expended across rows 7, 12, 16, 19, 22, 25, 27, 28).
8. **Co-pet linkage with inter-species cohabitation logged on a single pet's record** — Bolt + "Mittens" (row 26); Blue + "Magenta" (row 32); Odie + "Garfield" (row 18).
9. **Welfare officer alert + case closed** — Odie (row 11), Courage (row 23).
10. **Provisional/commercial ownership transfer while biological owner retained** — Bolt (row 6).
11. **Suspected animal-cruelty historical case linked to current pet** — Courage (row 2).
12. **Bite report (provocation, no skin break)** — Scooby (row 27).
13. **Anaphylaxis with epinephrine auto-injector prescription** — Scooby (row 29).
14. **Heartworm-positive recovery and standard 3-injection melarsomine protocol** — Bolt (rows 29–32).
15. **Multiple sequential owners (4 owners on one cat)** — Tom (rows 3, 11, 21, 36).

---

## Quick stats

| Pet | Total events | Uncommon ⚑ |
|---|---:|---:|
| Scooby-Doo | 51 | 14 |
| Brian Griffin | 48 | 11 |
| Santa's Little Helper | 48 | 11 |
| Snoopy | 43 | 10 |
| Odie | 44 | 11 |
| Bolt | 44 | 10 |
| Puss in Boots | 43 | 12 |
| Tom | 46 | 10 |
| Courage | 42 | 10 |
| Blue | 44 | 10 |
| **Total** | **453** | **109** |

— End —
