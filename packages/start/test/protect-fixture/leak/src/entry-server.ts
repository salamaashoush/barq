/**
 * Hand-written, for the reason `build-fixture` gives: the generated default
 * imports `@barqjs/router/server`, and the router depends on this package
 * rather than the other way round.
 */
import * as mounts from "virtual:barq-server-fns";

void mounts;

export default {
  fetch: () => new Response("not found", { status: 404 }),
};
