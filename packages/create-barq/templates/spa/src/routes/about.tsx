/**
 * The loader calls a SERVER function, which in an SPA is a real HTTP round trip
 * to `/_barq/fn/<id>`. Nothing about the call site says so, which is the point.
 */

import { Loading } from "@barqjs/core";
import { createFileRoute } from "@barqjs/router";

import { type Greeting, greeting } from "../data/greeting.ts";

function About() {
  const data = Route.useLoaderData();
  return (
    <section>
      <h1>About</h1>
      <Loading fallback={<p>loading…</p>}>
        <p>{() => data()?.message}</p>
        <p>
          answered at <code>{() => data()?.at}</code>
        </p>
      </Loading>
    </section>
  );
}

export const Route = createFileRoute<Greeting>("/about")({
  loader: () => greeting(),
  component: About,
});
