/**
 * happy-dom's globals, installed as this module's body: every import a module
 * declares is evaluated before its own first line, so a registration written
 * in `test-setup.ts` would come after `@barqjs/core` has read `typeof document`.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// The runtime's own WebSocket, which the compiler's Chrome driver reaches CDP
// with: happy-dom's replacement rejects a URL with a path, as every CDP
// endpoint has.
(globalThis as { __barqNativeWebSocket?: typeof WebSocket }).__barqNativeWebSocket = WebSocket;

GlobalRegistrator.register();
