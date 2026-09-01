// Turns a free-text contact value — the shape every schema that carries one
// promises to be "a phone OR an email" (`finderContact` in
// @dim/contract/api/pet-lost, `phoneE164` on the lost owner) — into a
// tappable link, or refuses to when the value cannot become one.
//
// PURE ON PURPOSE: `ContactRow` in components.tsx is a rendering shell
// around this. Deciding WHICH kind a value is, and what href/label it
// becomes, belongs here so it can be pinned without mounting React Native.

/** A contact value resolved into something a screen reader can act on.
 * `null` means the value could not become a link — too short to be a real
 * phone number and no "@" to read as an email — so the caller falls back
 * to a plain, unlinked row. */
export type ContactLink = {
  href: string;
  label: string;
  kind: "phone" | "email";
};

export function contactLink(value: string): ContactLink | null {
  const trimmed = value.trim();

  if (trimmed.includes("@")) {
    return { href: `mailto:${trimmed}`, label: `Escribir a ${trimmed}`, kind: "email" };
  }

  // Strip everything but digits and "+" — a `tel:` URL built from
  // unsanitized spaces/dashes ("tel:11 4123-4567") is rejected by some
  // dialers. A "+" is kept only when it led the original value, and only at
  // index 0 — "54+9+11" has no business becoming "+5491+1".
  const stripped = trimmed.replace(/[^\d+]/g, "");
  const hasLeadingPlus = stripped.startsWith("+");
  const digits = stripped.replace(/\+/g, "");
  if (digits.length < 6) return null; // too short to be a dialable number

  const sanitized = hasLeadingPlus ? `+${digits}` : digits;
  return { href: `tel:${sanitized}`, label: `Llamar al ${trimmed}`, kind: "phone" };
}
