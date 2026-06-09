import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MetricCard } from "./MetricCard";

describe("MetricCard", () => {
  it("renders with ln-* tokens and no gob- classes", () => {
    const html = renderToStaticMarkup(<MetricCard label="Test label" value="42" tone="neutral" />);
    expect(html).toContain("ln-");
    expect(html).not.toMatch(/gob-/);
  });

  it("applies warning tone classes", () => {
    const html = renderToStaticMarkup(
      <MetricCard label="Vacunas vencidas" value="348" tone="warning" delta="+12%" />,
    );
    expect(html).toContain("ln-warn");
    expect(html).not.toMatch(/gob-/);
  });

  it("applies danger tone classes", () => {
    const html = renderToStaticMarkup(<MetricCard label="Denuncias" value="27" tone="danger" />);
    expect(html).toContain("ln-seal");
    expect(html).not.toMatch(/gob-/);
  });
});
