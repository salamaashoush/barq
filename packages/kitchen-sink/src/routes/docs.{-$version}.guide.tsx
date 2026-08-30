/**
 * `/docs/{-$version}/guide` — an OPTIONAL path parameter.
 *
 * One route serves `/docs/guide` and `/docs/v2/guide`. Before the braced
 * grammar that needed two route files pointing at one component, and the two
 * could drift.
 */

import { createFileRoute, useParams } from "@barqjs/router";

function Guide() {
  const params = useParams();
  return (
    <section>
      <h2>Guide</h2>
      <p id="version">version: {() => params().version ?? "(none)"}</p>
    </section>
  );
}

export const Route = createFileRoute("/docs/{-$version}/guide")({ component: Guide });
