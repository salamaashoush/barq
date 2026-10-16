/**
 * The pages that are prose rather than a component, in the order the rail
 * lists them.
 *
 * Upstream writes these as MDX under `content/docs`. There is no markdown
 * pipeline here, so each one is a module beside this file: an element tree in
 * the page's `.typeset`, with every code sample imported from a file the
 * type-check and the suite both read.
 */

import type { Child } from "@barqjs/core";

import type { DocsSection } from "../../docs.tsx";

export interface GuideMeta {
  /** The URL segment: `/docs/<slug>`. */
  readonly slug: string;
  readonly title: string;
  readonly description: string;
}

export interface Guide extends GuideMeta {
  /** The `##` headings, which are the right-hand column. */
  readonly sections: readonly DocsSection[];
  readonly body: () => Child;
}

export const GUIDES: readonly GuideMeta[] = [
  {
    slug: "installation",
    title: "Installation",
    description: "How to install the dependencies and structure your app.",
  },
  {
    slug: "components-json",
    title: "components.json",
    description: "Configuration for your project.",
  },
  {
    slug: "theming",
    title: "Theming",
    description: "Using CSS variables and color tokens for theming.",
  },
  {
    slug: "dark-mode",
    title: "Dark Mode",
    description: "Adding dark mode to your app.",
  },
  {
    slug: "rtl",
    title: "RTL",
    description: "Right-to-left support for the components.",
  },
  {
    slug: "cli",
    title: "CLI",
    description: "Use the barq-ui CLI to add components to your project.",
  },
  {
    slug: "forms",
    title: "Forms",
    description: "Build forms with @barqjs/form and the Field components.",
  },
  {
    slug: "server-rendering",
    title: "Server Rendering",
    description: "The request, the response head, and where an async value comes from.",
  },
  {
    slug: "registry",
    title: "Registry",
    description: "Run your own component registry.",
  },
  {
    slug: "changelog",
    title: "Changelog",
    description: "Latest updates and announcements.",
  },
];
