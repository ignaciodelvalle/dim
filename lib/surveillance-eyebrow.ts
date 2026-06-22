// Pure helper: derive the surveillance page eyebrow label from the viewer's role.
// Admin → "Admin · Vigilancia", govt → "Gobierno · Vigilancia".

type SurveillanceRole = "admin" | "govt";

export function surveillanceEyebrow(role: SurveillanceRole): string {
  return role === "admin" ? "Admin · Vigilancia" : "Gobierno · Vigilancia";
}
