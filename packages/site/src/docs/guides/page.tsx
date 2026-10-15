/**
 * One guide's page: `/docs/<slug>`, in the shell the component pages use.
 */

import { dynamic, type Child } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Link, useParams } from "@barqjs/router";
import { Button, Empty } from "@barqjs/ui";

import { DocsPage, type RailEntry } from "../../docs.tsx";
import { COMPONENTS } from "../index.ts";
import { typeset } from "../typeset.ts";
import { guideNamed } from "./index.ts";
import type { Guide } from "./registry-data.ts";

const plain = css`
  text-decoration: none;
  color: inherit;
`;

const prose = css`
  width: 100%;
  flex: 1;
  padding-bottom: calc(var(--spacing) * 16);
`;

function components(): readonly RailEntry[] {
  return COMPONENTS.map((component) => ({
    to: `/docs/components/${component.slug}`,
    label: component.title,
  }));
}

export function GuidePage(): Child {
  const params = useParams();
  const guide = (): Guide | undefined => guideNamed(params().page ?? "");
  const Body = dynamic(() => guide()?.body);

  return (
    <>
      {() =>
        guide() === undefined ? (
          <DocsPage
            title="No such page"
            lede="Nothing in the documentation answers to that name."
            rail={components}
            sections={() => []}
          >
            <Empty>
              <Link to="/docs/components" class={plain}>
                <Button variant="outline">Back to the components</Button>
              </Link>
            </Empty>
          </DocsPage>
        ) : (
          <DocsPage
            title={() => guide()?.title ?? ""}
            lede={() => guide()?.description}
            rail={components}
            guide={() => guide()?.slug}
            sections={() => guide()?.sections ?? []}
          >
            <div class={`${typeset} ${prose}`} data-slot="guide">
              <Body />
            </div>
          </DocsPage>
        )
      }
    </>
  );
}
