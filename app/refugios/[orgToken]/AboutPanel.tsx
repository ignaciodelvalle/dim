import { Panel, PanelBody, PanelHeader } from "@/components/poncho/Panel";

import { AboutExpander } from "./AboutExpander";

// "Sobre nosotros" panel (handoff P2-3).
//
// Render-or-don't-render: when org.description is null or whitespace,
// the panel doesn't render at all (no EmptyState — silence is the
// intentional UX per handoff). When it exists, we truncate at 600 chars
// and show a "Ver más" expander island for the rest.

interface Props {
  description: string;
}

const TRUNCATE_AT = 600;

export function AboutPanel({ description }: Props) {
  const trimmed = description.trim();
  if (trimmed.length === 0) return null;

  const needsExpander = trimmed.length > TRUNCATE_AT;

  return (
    <Panel aria-labelledby="sobre-nosotros-title">
      <PanelHeader title={<span id="sobre-nosotros-title">Sobre nosotros</span>} />
      <PanelBody>
        {needsExpander ? (
          <AboutExpander text={trimmed} truncateAt={TRUNCATE_AT} />
        ) : (
          <p className="text-sm text-gob-text-gray whitespace-pre-line leading-relaxed">
            {trimmed}
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}
