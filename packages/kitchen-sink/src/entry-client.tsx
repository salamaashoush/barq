/**
 * The client entry, and it carries nothing an application should have to know.
 *
 * The boot order — start, preload the matched chunks, resolve the head, hydrate
 * the DOCUMENT — is the framework's and lives in `startClient`. Providers and
 * global styles are the ROOT ROUTE's, where they wrap every route on both
 * backends rather than only on this one.
 *
 * This file is OPTIONAL. `barqStart` generates exactly it when a project has no
 * `src/entry-client.*`; it is written out here so the reference application
 * exercises the same path an application that overrides the entry takes.
 */

import { startClient } from "@barqjs/router/client";

import { routeTree } from "./routeTree.gen.ts";

await startClient({ routeTree });
