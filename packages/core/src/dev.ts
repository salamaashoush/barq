/**
 * `@barqjs/core` under the `development` export condition: the same module
 * graph as the production entry, with the diagnostics console sink installed
 * and `isDev` true.
 */

import { installDevConsole } from "./dev-console.ts";
import { installInteractionFrames } from "./dev-interaction.ts";

export * from "./index.ts";

export const isDev: boolean = true;

installDevConsole();
installInteractionFrames();
