/**
 * happy-dom's globals, installed as this module's BODY.
 *
 * It cannot be a statement in `test-setup.ts`: every import a module declares
 * is evaluated before the first line of its own body runs, so a registration
 * written there happens after `@barqjs/core` has already been evaluated, and
 * `env.ts` reads `typeof document` once at module scope.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
