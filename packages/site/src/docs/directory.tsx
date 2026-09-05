/**
 * `/docs/components`, which upstream makes a DIRECTORY rather than a wall.
 *
 * Their page is a heading and three columns of links, one per component, and
 * that is the shape because sixty components do not fit on a page anybody can
 * read: the wall this site used to serve here was one enormous document whose
 * table of contents named twenty-nine groups, so the thing you came for was
 * never addressable.
 *
 * The wall is not gone — the designer's preview still renders it, which is what
 * it was always for: one page carrying every component at once is the right
 * canvas for changing a theme and watching sixty things move.
 */

import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Link } from "@barqjs/router";

import { DocsPage, type RailEntry } from "../docs.tsx";
import { COMPONENTS } from "./index.ts";
import type { ComponentDoc } from "./registry.ts";
import { typeset } from "./typeset.ts";

/** Three columns above `sm`, one below, which is theirs. */
const columns = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: calc(var(--spacing) * 3);
  margin-block-start: calc(var(--spacing) * 6);

  @media (width >= 40rem) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`;

const entry = css`
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--foreground);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
`;

const prose = css`
  width: 100%;
  flex: 1;
  padding-bottom: calc(var(--spacing) * 16);
`;

function rail(): readonly RailEntry[] {
  return COMPONENTS.map((component) => ({
    to: `/docs/components/${component.slug}`,
    label: component.title,
  }));
}

export function ComponentsDirectory() {
  return (
    <DocsPage
      title="Components"
      lede="Every component this package ships, transcribed from shadcn/ui's own class lists. One page each."
      rail={rail}
      sections={() => [{ id: "all-components", label: "All components" }]}
    >
      <div class={`${typeset} ${prose}`}>
        <h2 id="all-components">All components</h2>
        <div class={columns} data-not-typeset>
          <For each={() => COMPONENTS}>
            {(component: ComponentDoc) => (
              <Link class={entry} to={`/docs/components/${component.slug}`}>
                {component.title}
              </Link>
            )}
          </For>
        </div>
      </div>
    </DocsPage>
  );
}
