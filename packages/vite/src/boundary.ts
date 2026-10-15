import type { Plugin } from "vite";

import { consumerOf } from "./environment.ts";

const MARKER = "\0barq:boundary-marker";

/**
 * `import "server-only"` and `import "client-only"`, the markers Solid's plugin
 * claims.
 *
 * They complement barq's `.server.` and `.client.` file names rather than
 * replace them. A name is checked on the rendered bundle, so an import the
 * compiler emptied passes; a marker fails at the import edge, naming the
 * importer, which is what a library that cannot rename its files needs.
 *
 * The dependency scanner walks the raw graph before any transform has split a
 * module into its halves, so a marker it meets is resolved but never refused.
 */
export function boundaryModules(): Plugin {
  return {
    name: "barq:boundary-modules",
    enforce: "pre",
    sharedDuringBuild: true,
    resolveId(id, importer, options) {
      if (id !== "server-only" && id !== "client-only") return null;
      const scan = (options as { scan?: boolean } | undefined)?.scan === true;
      const server = consumerOf(this.environment, options) === "server";
      if (!scan && id === "server-only" && !server) {
        this.error(
          `[barq] \`${importer ?? "a module"}\` imports "server-only" and is in the browser bundle. ` +
            "Import it only from server code: a server function, a route's `server` handlers, or a module only they reach.",
        );
      }
      if (!scan && id === "client-only" && server) {
        this.error(
          `[barq] \`${importer ?? "a module"}\` imports "client-only" and is in the server bundle. ` +
            "Import it only from code that runs in the browser, such as inside `<ClientOnly>` or `createClientOnlyFn`.",
        );
      }
      return MARKER;
    },
    load(id) {
      return id === MARKER ? "export {};" : null;
    },
  };
}
