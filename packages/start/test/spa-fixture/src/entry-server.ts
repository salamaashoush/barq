/**
 * Hand-written, for the reason `build-fixture` gives: the generated default
 * imports `@barqjs/router/server`, and the router depends on this package
 * rather than the other way round.
 *
 * `serve.js` is generated either way, and it is what this fixture is for.
 */
import * as mounts from "virtual:barq-server-fns";

void mounts;

export default {
  fetch: () => new Response("not found", { status: 404 }),
  createFetch: () => () => new Response("not found", { status: 404 }),
};
