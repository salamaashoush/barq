/**
 * `/` — PRERENDERED to a static file at build time, then hydrated.
 *
 * `prerender` is read off the route's OPTIONS by the generator and lands in
 * `routeTree.gen.ts` as a literal, because a build has no runtime to ask.
 */

import { createFileRoute } from "@barqjs/router";

import { Counter } from "../components/Counter.tsx";

function Home() {
  return (
    <section>
      <h1>barq</h1>
      <p>This page was written to disk at build time, and is now interactive.</p>
      <Counter />
    </section>
  );
}

export const Route = createFileRoute("/")({
  prerender: true,
  component: Home,
});
