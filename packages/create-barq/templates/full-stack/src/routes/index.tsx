/**
 * `/` — PRERENDERED to a static file at build time, then hydrated.
 *
 * `prerender` is read off the route's OPTIONS by the generator and lands in
 * `routeTree.gen.ts` as a literal, because a build has no runtime to ask.
 */

import { signal } from "@barqjs/core";
import { createFileRoute } from "@barqjs/router";

function Home() {
  const count = signal(0);
  return (
    <section>
      <h1>barq</h1>
      <p>This page was written to disk at build time, and is now interactive.</p>
      <button type="button" onClick={() => count.update((n) => n + 1)}>
        clicked {count} times
      </button>
    </section>
  );
}

export const Route = createFileRoute("/")({
  prerender: true,
  component: Home,
});
