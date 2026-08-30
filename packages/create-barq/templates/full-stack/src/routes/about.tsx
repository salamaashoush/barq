/**
 * `/about` — SERVER-RENDERED per request, because its loader calls a server
 * function whose answer changes.
 *
 * Not prerendered, and the contrast with `/` is the point: a page whose content
 * is fixed at build time is a file on disk, and a page whose content is not is a
 * render.
 */

import { createFileRoute } from "@barqjs/router";

import { type Greeting, greeting } from "../data/greeting.ts";

function About() {
  const data = Route.useLoaderData();
  return (
    <section>
      <h1>About</h1>
      <p>{() => data()?.message ?? "…"}</p>
      <p>
        rendered at <code>{() => data()?.at ?? "…"}</code>
      </p>
    </section>
  );
}

export const Route = createFileRoute<Greeting>("/about")({
  loader: () => greeting(),
  component: About,
  head: {
    meta: [{ title: "About — barq" }],
  },
});
