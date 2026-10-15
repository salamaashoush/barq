import { For, type Child, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Link } from "@barqjs/router";

import { GUIDES, type GuideMeta } from "./docs/guides/registry-data.ts";
import { wrapper } from "./site.tsx";

/**
 * The docs shell, which is upstream's `/docs/*` layout.
 *
 * `container-wrapper flex flex-1 flex-col px-2` over `lg:grid
 * lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]`: a 288px rail and the
 * article beside it. Below `lg` the rail is hidden outright rather than
 * collapsed — a table of contents that becomes a hamburger inside a page that
 * already has one is two menus for one job, and their answer is that the
 * article is the whole page on a phone.
 */
const shell = css`
  /* calc(.25rem * 72) upstream, which is 288px. */
  --sidebar-width: calc(var(--spacing) * 72);
  --top-spacing: 0;

  display: flex;
  width: 100%;
  min-height: min-content;
  flex: 1;
  align-items: flex-start;
  padding-inline: 0;

  @media (width >= 64rem) {
    --top-spacing: calc(var(--spacing) * 4);

    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  }
`;

/**
 * `sticky top-[calc(var(--header-height)+0.6rem)] z-30 hidden
 * h-[calc(100svh-10rem)] overflow-hidden overscroll-none`.
 *
 * The offset is the header plus a tenth of an inch, and the height is the
 * viewport less ten rem, so the rail scrolls inside itself and the page
 * scrolls under it. `overscroll-none` is what stops a rail that has hit its
 * end from taking the page with it.
 */
const rail = css`
  display: none;
  position: sticky;
  top: calc(var(--header-height) + 0.6rem);
  z-index: 30;
  height: calc(100svh - 10rem);
  width: var(--sidebar-width);
  flex-direction: column;
  overflow: hidden;
  overscroll-behavior: none;
  background-color: transparent;
  color: var(--sidebar-foreground);

  @media (width >= 64rem) {
    display: flex;
  }
`;

const railScroll = css`
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-block: var(--top-spacing) calc(var(--spacing) * 8);
  padding-inline: calc(var(--spacing) * 2);

  /* The rail is a long list beside an article, and a scrollbar tracking it is
     a second vertical rule down the middle of the page. */
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const railGroup = css`
  display: grid;
  gap: calc(var(--spacing) * 1);
  padding-bottom: calc(var(--spacing) * 4);
`;

const railTitle = css`
  padding: calc(var(--spacing) * 2);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--muted-foreground);
`;

/**
 * `flex items-center gap-2 rounded-md p-2 text-left` — upstream's sidebar
 * menu button, at the 30px tall it measures.
 */
const railLink = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  border-radius: calc(var(--radius) - 2px);
  /* Their rail is a sidebar menu button: a 30px row on 12.8px text at a 500
     weight, in the FOREGROUND colour. Measured on their card page against ours
     at a 34px row of 14px/14px/400 muted text — a size larger, unweighted,
     dimmer, and four pixels taller on every one of sixty rows. */
  padding: calc(var(--spacing) * 1.5) calc(var(--spacing) * 2);
  text-align: left;
  font-size: 0.8rem;
  font-weight: 500;
  line-height: 1.4285;
  text-decoration: none;
  color: var(--foreground);
  transition:
    color 120ms,
    background-color 120ms;

  &:hover {
    background-color: var(--sidebar-accent);
    color: var(--sidebar-accent-foreground);
  }

  &[aria-current="true"] {
    background-color: var(--sidebar-accent);
    color: var(--sidebar-accent-foreground);
    font-weight: 500;
  }
`;

/**
 * The middle of three: the rail, this, and the page's own contents on the right.
 *
 * `flex min-w-0 flex-1 flex-col` holding the article, with the table of
 * contents as its sibling in a row. That is what puts the 640px measure at
 * x=392 rather than centred in the whole column — the article is centred in
 * what the two rails leave, not in the grid cell.
 *
 * `text-[1.05rem] sm:text-[15px]` is theirs too, and it is the base every
 * heading in the prose is a multiple of: `.typeset` sizes an `h2` at `1.25em`,
 * so a 16px base gives 20px against upstream's 18.75px and the whole page runs
 * a size large. Measured against their button page before this line existed.
 */
const middle = css`
  display: flex;
  min-width: 0;
  flex: 1;
  font-size: 1.05rem;

  @media (width >= 40rem) {
    font-size: 15px;
  }
`;

const column = css`
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
`;

/** `hidden xl:flex` — the page's own headings, on the right. */
const contents = css`
  display: none;
  width: calc(var(--spacing) * 72);
  flex-shrink: 0;

  @media (width >= 80rem) {
    display: block;
  }
`;

const contentsInner = css`
  position: sticky;
  top: calc(var(--header-height) + 0.6rem);
  display: grid;
  gap: calc(var(--spacing) * 1);
  padding-block: var(--top-spacing) calc(var(--spacing) * 8);
  padding-inline: calc(var(--spacing) * 6);
  max-height: calc(100svh - 10rem);
  overflow-y: auto;
  overscroll-behavior: contain;

  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

/**
 * `mx-auto flex w-full max-w-160 min-w-0 flex-1 flex-col gap-6 px-4 py-6
 * md:px-0 lg:py-8`.
 *
 * A 640px measure, centred in whatever the column leaves. That is narrower
 * than a gallery wants and it is upstream's number: a documentation page is
 * prose with examples in it, and an example that spans a wide screen stops
 * being readable beside the sentence explaining it.
 */
const article = css`
  margin-inline: auto;
  display: flex;
  width: 100%;
  max-width: 40rem;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: calc(var(--spacing) * 6);
  padding: calc(var(--spacing) * 6) calc(var(--spacing) * 4);

  @media (width >= 48rem) {
    padding-inline: 0;
  }

  @media (width >= 64rem) {
    padding-block: calc(var(--spacing) * 8);
  }
`;

/**
 * `flex flex-col gap-2` around the title ROW and the description under it.
 *
 * The description is a sibling of the row, not of the title, which is what
 * gives it the whole measure: nested beside the previous/next pair it came out
 * 381px wide against upstream's 512, because it was sharing a flex line with
 * them.
 */
const articleHead = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

/** `flex items-center justify-between md:items-start` — the title and the pair. */
const titleRow = css`
  display: flex;
  align-items: center;
  justify-content: space-between;

  @media (width >= 48rem) {
    align-items: flex-start;
  }
`;

/** `scroll-m-24 text-3xl font-semibold tracking-tight`. */
const heading = css`
  margin: 0;
  scroll-margin-top: 6rem;
  font-size: 1.875rem;
  line-height: 2.25rem;
  font-weight: 600;
  letter-spacing: -0.025em;
`;

/** `text-[1.05rem] text-muted-foreground sm:text-base sm:text-balance md:max-w-[80%]`. */
const lede = css`
  margin: 0;
  font-size: 1.05rem;
  color: var(--muted-foreground);
  text-wrap: pretty;

  @media (width >= 40rem) {
    font-size: 1rem;
    line-height: 1.5;
    text-wrap: balance;
  }

  @media (width >= 48rem) {
    max-width: 80%;
  }
`;

/** An anchor a rail link lands on, clearing the sticky header. */
export const anchor = css`
  scroll-margin-top: calc(var(--header-height) + calc(var(--spacing) * 8));
`;

export interface DocsSection {
  readonly id: string;
  readonly label: string;
}

/**
 * A rail entry, which is a LINK where the table of contents is an anchor.
 *
 * Upstream's rail lists every component and each one is its own page
 * (`/docs/components/radix/button`); the right-hand column lists the headings
 * on the page you are on. Two lists, two jobs, and this site had them both
 * pointing at anchors on one enormous page.
 */
export interface RailEntry {
  readonly to: string;
  readonly label: string;
  /** Highlighted, which the rail decides by comparing against the location. */
  readonly current?: boolean;
}

/** `Grouped and multiple` → `grouped-and-multiple`, which is the anchor. */
export function slugOf(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function DocsPage(
  props: Incoming<{
    title: string;
    lede?: string;
    /** The right-hand column: the headings on THIS page, as anchors. */
    sections: readonly DocsSection[];
    /** The left rail: every component, as links. */
    rail?: readonly RailEntry[];
    /** The guide being read, which the rail's first group marks. */
    guide?: string;
    /** Beside the title — upstream's previous/next pair. */
    actions?: Child;
    children?: Child;
  }>,
) {
  return (
    <div class={wrapper}>
      <div class={shell}>
        <aside class={rail} aria-label="Documentation">
          <div class={railScroll}>
            {GUIDES.length === 0 ? null : (
              <div class={railGroup}>
                <span class={railTitle}>Get Started</span>
                <For each={() => GUIDES}>
                  {(entry: GuideMeta) => (
                    <Link
                      class={railLink}
                      to={`/docs/${entry.slug}`}
                      aria-current={() => props.guide?.() === entry.slug}
                    >
                      {entry.title}
                    </Link>
                  )}
                </For>
              </div>
            )}
            <div class={railGroup}>
              <span class={railTitle}>Components</span>
              <For each={() => props.rail?.() ?? []}>
                {(entry: RailEntry) => (
                  <Link class={railLink} to={entry.to} aria-current={entry.current === true}>
                    {entry.label}
                  </Link>
                )}
              </For>
            </div>
          </div>
        </aside>
        <div class={middle}>
          <div class={column}>
            <div class={article}>
              <div class={articleHead}>
                <div class={titleRow}>
                  <h1 class={heading}>{props.title}</h1>
                  {props.actions === undefined ? null : props.actions}
                </div>
                {props.lede?.() === undefined ? null : <p class={lede}>{props.lede()}</p>}
              </div>
              {props.children}
            </div>
          </div>
          <div class={contents}>
            <div class={contentsInner}>
              <span class={railTitle}>On this page</span>
              <For each={() => props.sections()}>
                {(entry: DocsSection) => (
                  <a class={railLink} href={`#${entry.id}`}>
                    {entry.label}
                  </a>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
