/**
 * happy-dom's globals, installed as this module's BODY.
 *
 * Not in `preload.ts`'s own body: ESM evaluates every import a module declares
 * before the first line of its body runs, so "every import below happens after
 * this line" is not a promise ESM makes. One eager `import "@barqjs/core"` in
 * `preload.ts` would flip `isServer` to true for every test, silently, since
 * `env.ts` reads `typeof document` once at module scope. The same mistake did
 * exactly that to `@barqjs/testing`'s suite.
 *
 * Imported FIRST in `preload.ts`, which is what makes the ordering a fact
 * rather than a hope.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// The runtime's own WebSocket, kept before happy-dom overwrites it. happy-dom's
// replacement rejects any URL with a path, and a CDP endpoint is
// `ws://127.0.0.1:PORT/devtools/browser/<id>` — so test/chrome.ts cannot reach a
// real browser from inside `bun test` without this. See chrome.ts.
(globalThis as { __barqNativeWebSocket?: typeof WebSocket }).__barqNativeWebSocket = WebSocket;

GlobalRegistrator.register();

// happy-dom models SVGElement.className as a WRITABLE string. In a browser it is
// a get-only SVGAnimatedString, and `element.className = x` throws in module
// code. Without this shim the whole corpus stays green with O5 unfixed, because
// the one path that is broken in a browser works here.
Object.defineProperty(SVGElement.prototype, "className", {
  configurable: true,
  get(this: Element) {
    const value = this.getAttribute("class") ?? "";
    return { baseVal: value, animVal: value };
  },
});
