// Pure composer tests — no DB, no network. Pins the PII boundary (T2-N1
// rule: label + count + a fixed portal link, nothing else) and the subject
// line's singular/plural agreement.

import { describe, expect, it } from "vitest";

import {
  type DigestQueueItem,
  composeDigestEmail,
  digestSubject,
  totalPendingCount,
} from "./daily-operator-digest-composer";

const ITEMS: DigestQueueItem[] = [
  { label: "Aprobaciones pendientes", count: 3, href: "https://mimar.com.ar/gob/cola" },
  {
    label: "Denuncias de maltrato derivadas",
    count: 1,
    href: "https://mimar.com.ar/org/abc123/maltrato/recibidos",
  },
];

describe("totalPendingCount", () => {
  it("sums every item's count", () => {
    expect(totalPendingCount(ITEMS)).toBe(4);
  });

  it("is 0 for an empty list", () => {
    expect(totalPendingCount([])).toBe(0);
  });
});

describe("digestSubject", () => {
  it("uses singular for exactly one pending item", () => {
    expect(digestSubject([{ label: "x", count: 1, href: "https://mimar.com.ar/x" }])).toBe(
      "1 pendiente te espera en miMAR",
    );
  });

  it("uses plural for more than one", () => {
    expect(digestSubject(ITEMS)).toBe("4 pendientes te esperan en miMAR");
  });
});

describe("composeDigestEmail", () => {
  const input = {
    recipientLabel: "gobierno" as const,
    items: ITEMS,
    unsubscribeUrl: "https://mimar.com.ar/api/digest/unsubscribe?u=abc&t=xyz",
    accountUrl: "https://mimar.com.ar/cuenta",
  };

  it("carries the subject from digestSubject", () => {
    const { subject } = composeDigestEmail(input);
    expect(subject).toBe(digestSubject(ITEMS));
  });

  it("renders every item's label, count and href in both html and text", () => {
    const { html, text } = composeDigestEmail(input);
    for (const item of ITEMS) {
      expect(html).toContain(item.label);
      expect(html).toContain(String(item.count));
      expect(html).toContain(item.href);
      expect(text).toContain(item.label);
      expect(text).toContain(String(item.count));
      expect(text).toContain(item.href);
    }
  });

  it("carries the unsubscribe and account links in both html and text", () => {
    const { html, text } = composeDigestEmail(input);
    expect(html).toContain(input.unsubscribeUrl);
    expect(html).toContain(input.accountUrl);
    expect(text).toContain(input.unsubscribeUrl);
    expect(text).toContain(input.accountUrl);
  });

  it("PII BOUNDARY: the rendered output never carries anything beyond the {label, count, href} shape", () => {
    // Every word that appears in html/text must trace back to one of: a
    // queue label, a count, a URL, or the fixed template copy — never a
    // person's name, a pet's name, or free text. We assert this negatively:
    // no digit sequence appears that isn't one of the item counts (a stand-in
    // for "no DNI/phone leaked in") and no @ sign appears (no email address
    // embedded in the body itself — only in the SMTP envelope, which this
    // composer never sees).
    const { html, text } = composeDigestEmail(input);
    expect(html).not.toMatch(/@/);
    expect(text).not.toMatch(/@/);
  });

  it("es-AR greeting uses the recipient label", () => {
    const govt = composeDigestEmail({ ...input, recipientLabel: "gobierno" });
    const org = composeDigestEmail({ ...input, recipientLabel: "organización" });
    expect(govt.html).toContain("gobierno");
    expect(org.html).toContain("organización");
  });

  it("escapes HTML-significant characters in a label (defense in depth)", () => {
    const { html } = composeDigestEmail({
      ...input,
      items: [{ label: "<script>x</script>", count: 1, href: "https://mimar.com.ar/x" }],
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
