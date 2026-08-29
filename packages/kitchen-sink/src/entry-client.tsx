/**
 * The client entry, and it carries nothing an application should have to know.
 *
 * The boot order — start, preload the matched chunks, resolve the head, hydrate
 * the DOCUMENT — is the framework's and lives in `startClient`. Providers and
 * global styles are the ROOT ROUTE's, where they wrap every route on both
 * backends rather than only on this one.
 */

import { startClient } from "@barqjs/router/client";
import { routes } from "virtual:barq-routes";

await startClient({ routes });
