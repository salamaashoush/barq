import type { JSXElement } from "@barqjs/core";

/** One example's place in the gallery: plain data, so the shell can list it without loading it. */
export interface ExampleInfo {
  /** The anchor on the group's page. */
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  /** The arc exports it shows, which the command menu finds it by. */
  readonly covers: readonly string[];
}

export interface GroupCatalog {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly examples: readonly ExampleInfo[];
}

/** The example itself, and its file's text for the code panel. */
export interface Demo {
  readonly component: () => JSXElement;
  readonly code: string;
}

export type Demos = Readonly<Record<string, Demo>>;
