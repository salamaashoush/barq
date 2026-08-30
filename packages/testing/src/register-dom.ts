/**
 * happy-dom's globals, installed as this module's BODY.
 *
 * It cannot be a statement in `preload.ts`. Every import a module declares is
 * evaluated before the first line of its own body runs, so the registration
 * used to happen after `./index.ts` — and therefore `@barqjs/core` — had
 * already been evaluated. `env.ts` reads `typeof document` once, at module
 * scope, so the whole suite ran with `isServer === true` against a live DOM:
 * every `isServer ? … : …` in the framework took the branch no browser takes,
 * and nothing failed, because the client branch was simply never measured.
 *
 * Imported FIRST in `preload.ts`, which is what makes this run first.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
