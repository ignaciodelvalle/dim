// Smoke tests for Wave 3.2 base layout/typography primitives.
//
// Pattern: renderToStaticMarkup (no jsdom, same as existing UI tests).
// Covers: Text (sizes, tones, weights, polymorphic `as`) + Stack (gap, forwardRef).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Stack } from "@/components/ui/primitives/Stack";
import { Text } from "@/components/ui/primitives/Text";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

describe("<Text>", () => {
  it("renders default size (base) with correct token class", () => {
    const html = render(<Text>Hello</Text>);
    expect(html).toContain("--text-base");
    expect(html).toContain("Hello");
  });

  it("renders xs size with xs token", () => {
    const html = render(<Text size="xs">Micro</Text>);
    expect(html).toContain("--text-xs");
    expect(html).toContain("--leading-xs");
  });

  it("renders 2xl size with 2xl token", () => {
    const html = render(<Text size="2xl">Big</Text>);
    expect(html).toContain("--text-2xl");
  });

  it("renders mute tone", () => {
    const html = render(<Text tone="mute">Muted</Text>);
    expect(html).toContain("color-ln-mute");
  });

  it("renders semibold weight", () => {
    const html = render(<Text weight="semibold">Bold</Text>);
    expect(html).toContain("font-semibold");
  });

  it("renders as <p> when as=p", () => {
    const html = render(<Text as="p">Paragraph</Text>);
    expect(html).toMatch(/^<p/);
  });

  it("renders as <span> by default", () => {
    const html = render(<Text>Span text</Text>);
    expect(html).toMatch(/^<span/);
  });

  it("forwards className", () => {
    const html = render(<Text className="my-custom">Text</Text>);
    expect(html).toContain("my-custom");
  });
});

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------

describe("<Stack>", () => {
  it("renders as a flex column", () => {
    const html = render(
      <Stack>
        <span>A</span>
      </Stack>,
    );
    expect(html).toContain("flex-col");
    expect(html).toContain("flex");
  });

  it("applies default gap-4 (md)", () => {
    const html = render(
      <Stack>
        <span>A</span>
      </Stack>,
    );
    expect(html).toContain("gap-4");
  });

  it("applies gap-2 when gap=sm", () => {
    const html = render(
      <Stack gap="sm">
        <span>A</span>
      </Stack>,
    );
    expect(html).toContain("gap-2");
  });

  it("applies gap-0 when gap=none", () => {
    const html = render(
      <Stack gap="none">
        <span>A</span>
      </Stack>,
    );
    expect(html).toContain("gap-0");
  });

  it("renders children", () => {
    const html = render(
      <Stack>
        <span>Item 1</span>
        <span>Item 2</span>
      </Stack>,
    );
    expect(html).toContain("Item 1");
    expect(html).toContain("Item 2");
  });

  it("forwards className", () => {
    const html = render(
      <Stack className="my-stack">
        <span>X</span>
      </Stack>,
    );
    expect(html).toContain("my-stack");
  });
});
