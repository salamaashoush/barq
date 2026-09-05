/**
 * `.typeset`, which is upstream's prose stylesheet
 * (`apps/v4/app/(app)/(typeset)/typeset.css`).
 *
 * A documentation page is prose with examples in it, and the prose is where a
 * port shows: a heading at the wrong size or a paragraph at the wrong rhythm
 * reads as "not shadcn" long before a component does. So the four variables at
 * the top are theirs and every rule below is a fraction of them, which is what
 * makes the whole page rescale from `--typeset-size`.
 *
 * Ported rather than transcribed, because there is no class list to transcribe:
 * this is hand-written CSS upstream too. What is left out is what this site has
 * no markup for — footnotes, math, GFM task lists, definition lists, RTL.
 *
 * `:where()` on every selector, at zero specificity, is the load-bearing part.
 * A component inside the prose carries its own rules at 0-1-0 and must not have
 * to fight the page it sits on: `<Button>` inside a `<p>` keeps its own padding
 * because `:where(p) button` weighs nothing.
 */

import { css } from "@barqjs/css";

export const typeset = css`
  --typeset-font-body: inherit;
  --typeset-font-heading: inherit;
  --typeset-font-mono: var(--font-mono);
  --typeset-size: 1em;
  --typeset-leading: 1.75;
  --typeset-flow: 1.25em;
  --typeset-muted: var(--muted-foreground);
  --typeset-rule: var(--border);

  font-family: var(--typeset-font-body);
  font-size: calc(var(--typeset-size) * 1.125);
  line-height: var(--typeset-leading);
  color: var(--foreground);
  overflow-wrap: break-word;
  margin-trim: block-start;

  @media (width >= 48rem) {
    font-size: var(--typeset-size);
  }

  /* [data-not-typeset] is the opt-out every embedded component wears: a
     preview card is a component, not prose, and inheriting a paragraph's
     margins is how one ends up 20px below where upstream puts it. */
  & *:not(:where([data-not-typeset], [data-not-typeset] *)) {
    &:where(p) {
      margin-block-start: var(--typeset-flow);
      margin-block-end: 0;
    }

    &:where(h1, h2, h3, h4, h5, h6) {
      color: var(--foreground);
      font-family: var(--typeset-font-heading);
      font-weight: 600;
      margin-block-end: 0;
    }
    &:where(h1) {
      font-size: 1.75em;
      line-height: 1.3;
      margin-block-start: var(--typeset-flow);
    }
    &:where(h2) {
      font-size: 1.25em;
      line-height: 1.4;
      margin-block-start: calc(var(--typeset-flow) * 1.4);
    }
    &:where(h3) {
      font-size: 1.125em;
      line-height: 1.45;
      margin-block-start: var(--typeset-flow);
    }
    &:where(h4) {
      font-size: 1em;
      line-height: 1.5;
      margin-block-start: var(--typeset-flow);
    }

    &:where([id]) {
      scroll-margin-block-start: calc(var(--header-height) + var(--typeset-flow));
    }

    /* Headings own the space below them. */
    &:where(h1 + *, h2 + *, h3 + *, h4 + *, h5 + *, h6 + *) {
      margin-block-start: 1em;
    }
    &:where(:is(h1, h2, h3, h4) :is(code)) {
      font-size: 0.9em;
    }

    &:where(a) {
      color: inherit;
      font-weight: 500;
      text-decoration-line: underline;
      text-decoration-color: color-mix(in oklab, currentColor 30%, transparent);
    }
    &:where(a:hover) {
      text-decoration-color: currentColor;
    }
    &:where(a:focus-visible) {
      outline: 2px solid var(--ring);
      outline-offset: 2px;
      border-radius: 0.125em;
    }
    &:where(:is(h1, h2, h3, h4, h5, h6) :is(a)) {
      font-weight: inherit;
    }

    &:where(strong, b) {
      font-weight: 600;
    }

    &:where(ul) {
      list-style-type: disc;
    }
    &:where(ol) {
      list-style-type: decimal;
    }
    &:where(ul ul) {
      list-style-type: circle;
    }
    &:where(ul, ol) {
      margin-block-start: var(--typeset-flow);
      margin-block-end: 0;
      padding-inline-start: 1.5em;
    }
    &:where(li) {
      margin-block-start: 0.5em;
      padding-inline-start: 0.4em;
    }
    &:where(li > p, li > ul, li > ol) {
      margin-block-start: 0.5em;
    }
    &:where(ul > li)::marker,
    &:where(ol > li)::marker {
      color: var(--typeset-muted);
    }

    &:where(kbd) {
      font-family: inherit;
      font-size: 0.85em;
      font-weight: 500;
      border: 1px solid var(--typeset-rule);
      border-block-end-width: 2px;
      border-radius: min(calc(var(--radius) * 0.6), 0.35em);
      padding: 0.0625em 0.35em;
    }

    &:where(:not(pre) > code) {
      background-color: var(--muted);
      font-family: var(--typeset-font-mono);
      font-size: 0.85em;
      border-radius: min(calc(var(--radius) * 0.6), 0.35em);
      padding: 0.125em 0.3em;
    }

    &:where(pre) {
      background-color: var(--muted);
      font-family: var(--typeset-font-mono);
      font-size: 0.875em;
      line-height: 1.5;
      tab-size: 2;
      border-radius: var(--radius);
      padding: 0.75em 1em;
      overflow-x: auto;
      margin-block-start: calc(var(--typeset-flow) / 0.875);
      margin-block-end: 0;
    }
    &:where(pre code) {
      background-color: transparent;
      font-family: inherit;
      font-size: inherit;
      padding: 0;
      border-radius: 0;
    }

    &:where(blockquote) {
      border-inline-start: 2px solid var(--typeset-rule);
      padding-inline-start: 1em;
      margin-block: var(--typeset-flow) 0;
      margin-inline: 0;
    }

    &:where(hr) {
      border: 0;
      border-block-start: 1px solid var(--typeset-rule);
      margin-block-start: calc(var(--typeset-flow) * 2.4);
      margin-block-end: 0;
    }

    &:where(table) {
      max-width: 100%;
      font-size: 1em;
      line-height: 1.5;
      font-variant-numeric: tabular-nums;
      border-collapse: separate;
      border-spacing: 0;
      border-block-end: 1px solid var(--typeset-rule);
      margin-block-start: var(--typeset-flow);
      margin-block-end: 0;
    }
    &:where(thead th) {
      font-weight: 500;
      text-align: start;
      white-space: nowrap;
      padding: 0.65em 1em;
    }
    &:where(:is(tbody, tfoot) :is(td, th)) {
      padding: 0.75em 1em;
      text-align: start;
      vertical-align: top;
      border-block-start: 1px solid var(--typeset-rule);
    }
    &:where(tbody th, tfoot th) {
      font-weight: 500;
    }
    &:where(th:first-child, td:first-child) {
      padding-inline-start: 0;
    }
  }

  /* First child adds no space above. Last so it wins the tie. */
  & > :where(:first-child):not(:where([data-not-typeset], [data-not-typeset] *)),
  &
    :where(li > :first-child, blockquote > :first-child, td > :first-child, th > :first-child):not(
      :where([data-not-typeset], [data-not-typeset] *)
    ) {
    margin-block-start: 0;
  }
`;
