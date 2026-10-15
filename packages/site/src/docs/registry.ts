/**
 * What every component's documentation page is, as data.
 *
 * Upstream's is MDX with `<ComponentPreview name="button-demo" />` in it, and
 * the name resolves against a registry of demo modules. This is the same split
 * without the markdown: a page is a title, a description and a list of demos,
 * and the prose that is not a demo is short enough to be a string.
 *
 * A ported page's demos live in `examples/<slug>/`, one file per example, and
 * the code under each is that file's own text, so what is shown is what runs.
 * They are COMPONENTS rather than JSX, because a component is a Block and a
 * Block invoked outside a scope throws: the page places them with
 * `<Dynamic />`.
 */

import type { Child } from "@barqjs/core";

export interface Demo {
  /**
   * The `##` heading, and the anchor. Omitted on the first demo, which is the
   * hero preview upstream puts directly under the description.
   */
  readonly title?: string;
  /** A sentence above the card, where the example needs one. */
  readonly note?: string;
  readonly align?: "center" | "start" | "end";
  /** `auto` for an example that does not fit 288px: a sidebar, a long form. */
  readonly size?: "fixed" | "auto";
  /**
   * The example sets its own direction, so the card offers no toggle: flipping
   * the frame around a tree that names `dir` itself would move nothing.
   */
  readonly rtl?: boolean;
  readonly code: string;
  readonly component: () => Child;
}

export interface ComponentDoc {
  /** The URL segment, which is upstream's registry name. */
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  /**
   * What `barq-ui add` writes. The slug, unless the component shares a file;
   * `false` for a page of plain elements, which has nothing to install.
   */
  readonly add?: string | false;
  /** The import line, and the smallest call that uses it. */
  readonly usage: string;
  readonly demos: readonly Demo[];
}

/** The one thing a page needs that is not on the entry: what the CLI installs. */
export function addName(entry: ComponentDoc): string | undefined {
  return entry.add === false ? undefined : (entry.add ?? entry.slug);
}
