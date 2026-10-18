import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";
import { resetErrorHalt } from "@barqjs/core";

GlobalRegistrator.register();

// An error nothing catches halts the engine for good; a test that provokes one
// has already asserted on it, and the next test must not inherit the halt.
globalThis.reportError = () => {};
afterEach(() => {
  resetErrorHalt();
});
