/**
 * `/` — PRERENDERED, and it is the demonstration rather than a default.
 *
 * `prerender` and `ssr` are lifted out of this file's source by the route
 * generator and land in the table as literals. They cannot be read at runtime:
 * every route module is `lazy()`, and both answers are wanted before it loads —
 * `ssr` by the string backend before it renders the depth, `prerender` by a
 * build with no runtime at all.
 */

export const prerender = true;

export { SignalsDemo as default } from "../demos/SignalsDemo";
