/**
 * `/` — PRERENDERED, and it is the demonstration rather than a default.
 *
 * `prerender` and `ssr` are properties of the route's OPTIONS, lifted out of
 * this file's source by the generator and landing in the table as literals.
 * They cannot be read at runtime: every route module is `lazy()`, and both
 * answers are wanted before it loads — `ssr` by the string backend before it
 * renders the depth, `prerender` by a build with no runtime at all.
 */

import { createFileRoute } from "@barqjs/router";

import { SignalsDemo } from "../demos/SignalsDemo";

export const Route = createFileRoute("/")({
  prerender: true,
  component: SignalsDemo,
});
