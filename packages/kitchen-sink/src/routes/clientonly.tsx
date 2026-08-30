/**
 * `/clientonly` — a region that cannot be server-rendered.
 *
 * The server writes the fallback, the client's FIRST render writes it too (so
 * hydration compares the same tree), and only then does it swap to the
 * children. `ssr: false` is the route-level answer to the same problem; this is
 * the component-level one.
 */

import { ClientOnly, createFileRoute } from "@barqjs/router";

function Demo() {
  return (
    <section>
      <h2>Client only</h2>
      <ClientOnly fallback={<p id="co-fallback">skeleton</p>}>
        <p id="co-children">width is {() => String(globalThis.innerWidth)}</p>
      </ClientOnly>
    </section>
  );
}

export const Route = createFileRoute("/clientonly")({ component: Demo });
