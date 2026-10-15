/**
 * `@barqjs/core` under the `development` export condition: the same module
 * graph as the production entry, with the diagnostics console sink installed
 * and `isDev` true.
 */

import { installDevConsole } from "./dev-console.ts";

export * from "./index.ts";

export const isDev: boolean = true;

installDevConsole();
