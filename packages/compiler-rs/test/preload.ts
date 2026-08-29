import { GlobalRegistrator } from "@happy-dom/global-registrator";

// The runtime's own WebSocket, kept before happy-dom overwrites it. happy-dom's
// replacement rejects any URL with a path, and a CDP endpoint is
// `ws://127.0.0.1:PORT/devtools/browser/<id>` — so test/chrome.ts cannot reach a
// real browser from inside `bun test` without this. See chrome.ts.
(globalThis as { __barqNativeWebSocket?: typeof WebSocket }).__barqNativeWebSocket = WebSocket;

// Register before anything else: the core runtime captures DOM globals at
// module-eval time, so every import below has to happen after this line.
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

import { mock } from "bun:test";
import { installTracer } from "./tracer.ts";

const { signalsPath, domPath } = installTracer((path, factory) => {
  mock.module(path, factory);
});

// Surfaced so a broken resolution fails loudly at startup instead of silently
// producing zero-effect traces and an always-zero anchor expectation.
if (!signalsPath.endsWith("signals.ts")) {
  throw new Error(`tracer resolved an unexpected signals module: ${signalsPath}`);
}
if (!domPath.endsWith("dom.ts")) {
  throw new Error(`tracer resolved an unexpected dom module: ${domPath}`);
}
