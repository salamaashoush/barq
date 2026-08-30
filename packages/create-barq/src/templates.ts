/**
 * The catalogue, shared by the CLI and by the gate that builds every entry in
 * it. A template the gate does not know about is a template that has never been
 * built, so there is one list and both read it.
 */

export interface Template {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** The document is `index.html` rather than the root route's shell. */
  readonly spa: boolean;
  /** The build writes static pages, so the gate can look for them. */
  readonly prerenders: boolean;
  /** `dist/server/serve.js` is the thing you run. */
  readonly server: boolean;
  /**
   * Where the browser's half lands, project-relative.
   *
   * `barqStart` splits the output in two so the server half has somewhere to
   * go; a template built by Vite alone keeps Vite's own `dist`.
   */
  readonly clientOut: string;
}

export const TEMPLATES: readonly Template[] = [
  {
    name: "full-stack",
    title: "Full-stack",
    description: "Server-rendered pages, API routes, server functions, prerendering.",
    spa: false,
    prerenders: true,
    server: true,
    clientOut: "dist/client",
  },
  {
    name: "spa",
    title: "SPA",
    description: "Client-rendered routing with server functions. The document is index.html.",
    spa: true,
    prerenders: false,
    server: true,
    clientOut: "dist/client",
  },
  {
    name: "minimal",
    title: "Minimal",
    description: "The compiler and signals, no router. One page, one mount.",
    spa: true,
    prerenders: false,
    server: false,
    clientOut: "dist",
  },
];

export const DEFAULT_TEMPLATE = "full-stack";

export function findTemplate(name: string): Template | undefined {
  return TEMPLATES.find((template) => template.name === name);
}
