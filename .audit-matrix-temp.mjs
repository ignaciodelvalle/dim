import fs from "node:fs";
import path from "node:path";

const types = [
  "pet_registered","pet_profile_updated","status_changed","death_recorded",
  "vaccination_administered","deworming_administered","sterilization_performed",
  "medication_started","medication_stopped","vet_visit_logged","weight_recorded",
  "microchip_implanted","microchip_replaced","tattoo_recorded","tattoo_updated",
  "dangerous_breed_attested","note_added","credential_scanned","incident_reported",
  "rabies_observation_started","rabies_observation_ended","medication_dose_taken",
  "symptom_observed","abandonment_reported","maltreatment_reported","clinical_info_logged",
  "shelter_intake_recorded","foster_assigned","foster_ended","adoption_application_submitted",
  "adoption_application_resolved","adoption_finalized","post_adoption_checkin","adoption_reversed",
  "custody_transferred","ownership_claimed","custody_transfer_proposed","custody_transfer_cancelled",
  "custody_dispute_raised","custody_dispute_resolved","foster_proposed","foster_proposal_resolved",
  "foster_co_foster_allowed","adoption_eligibility_set","outbreak_signal","disease_reported",
  "movement_recorded","event_amended",
];

const dashboards = [
  "home","panorama","vigilancia","campanas","poblacion","analytics","mortalidad",
  "perdidas","maltrato","decomisos","censo","programa","outbox","outreach","usuarios","adopciones",
];

// Map file paths to dashboard columns (a file can feed multiple)
function dashForFile(rel) {
  const d = new Set();
  if (rel === "app/gob/page.tsx" || rel.includes("govt-home-kpis")) d.add("home");
  if (rel.includes("panorama") || rel.includes("get-panorama-kpis")) d.add("panorama");
  if (
    rel.includes("app/gob/vigilancia") ||
    rel.includes("surveillance-metrics") ||
    rel.includes("govt-dashboards") && rel.includes("Surveillance")
  ) d.add("vigilancia");
  if (rel.includes("app/gob/campanas")) d.add("campanas");
  if (rel.includes("population-control") || rel.includes("app/gob/poblacion")) d.add("poblacion");
  if (
    rel.includes("govt-dashboards") ||
    rel.includes("app/gob/analytics") ||
    rel.includes("analytics-ranking") ||
    rel.includes("territorial-data-quality") ||
    rel.includes("policy-outcome")
  ) d.add("analytics");
  if (rel.includes("mortality-metrics") || rel.includes("app/gob/mortalidad") || rel.includes("trends.ts")) d.add("mortalidad");
  if (rel.includes("reunification") || rel.includes("app/gob/perdidas") || rel.includes("lost-listing")) d.add("perdidas");
  if (rel.includes("app/gob/maltrato") || (rel.includes("welfare") && !rel.includes("outreach"))) d.add("maltrato");
  if (rel.includes("app/gob/decomisos") || rel.includes("decomiso")) d.add("decomisos");
  if (rel.includes("census.ts") || rel.includes("app/gob/censo")) d.add("censo");
  if (rel.includes("program-health") || rel.includes("app/gob/programa")) d.add("programa");
  if (rel.includes("event-outbox") || rel.includes("app/gob/outbox")) d.add("outbox");
  if (rel.includes("outreach-pipelines") || rel.includes("app/gob/outreach")) d.add("outreach");
  if (rel.includes("compliance-metrics") || rel.includes("app/gob/usuarios")) d.add("usuarios");
  if (rel.includes("custody.ts") || rel.includes("app/gob/adopciones")) d.add("adopciones");
  if (rel.includes("freshness") || rel.includes("event-ledger")) {
    // cross-cutting ingest freshness — attribute to home+panorama only
    d.add("home"); d.add("panorama");
  }
  return [...d];
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const roots = ["lib/analytics", "lib/metrics", "src/modules/panorama", "app/gob", "app/admin", "src/modules/welfare", "src/modules/decomiso"];
const files = roots.flatMap((r) => walk(r));

const dashContent = Object.fromEntries(dashboards.map((d) => [d, ""]));
for (const f of files) {
  const rel = f.replace(/\\/g, "/").replace(/^.*?\/(app\/|lib\/|src\/)/, "$1");
  const dashes = dashForFile(rel);
  if (!dashes.length) continue;
  const text = fs.readFileSync(f, "utf8");
  for (const d of dashes) dashContent[d] += "\n" + text;
}

const matrix = {};
for (const t of types) {
  matrix[t] = {};
  for (const d of dashboards) {
    const content = dashContent[d];
    const patterns = [
      `'${t}'`,
      `"${t}"`,
      `eq(petEvents.eventType, '${t}')`,
      `eventType: '${t}'`,
      `event_type = '${t}'`,
      `tipo_evento_code`,
    ];
    matrix[t][d] = patterns.some((p) => p !== "tipo_evento_code" && content.includes(p));
  }
}

// Manual enrichments from cross-table projections (pets table, welfare_reports, cases, pet_identifications)
const manual = {
  pet_registered: ["analytics","censo","poblacion","home","panorama"],
  pet_profile_updated: [],
  status_changed: ["perdidas","analytics","compliance via reunification"],
  death_recorded: ["mortalidad","vigilancia","analytics"],
  microchip_implanted: ["usuarios"], // C1 reads pet_identifications not event
  dangerous_breed_attested: ["usuarios"],
  credential_scanned: ["perdidas"], // lost listing scan density?
  abandonment_reported: ["maltrato"],
  maltreatment_reported: ["maltrato"],
  symptom_observed: ["vigilancia","analytics"],
};

console.log("event\t" + dashboards.join("\t") + "\tcount");
for (const t of types) {
  const cols = dashboards.map((d) => (matrix[t][d] ? "Y" : ""));
  const count = cols.filter((x) => x === "Y").length;
  console.log(`${t}\t${cols.join("\t")}\t${count}`);
}
