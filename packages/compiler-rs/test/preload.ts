// FIRST, and in its own module. See `./register-dom.ts` for why the
// registration cannot live in this file's body.
import * as dom from "./register-dom.ts";

void dom;

import { afterEach, mock } from "bun:test";
import { installTracer } from "./tracer.ts";

// The engine hands an error nothing caught to `reportError`, which is what a
// crashed page should do. A fixture that provokes one is asserting on it, and
// the report must not fail the run from between two tests.
globalThis.reportError = () => {};
// It also stops scheduling for good, and every file here shares one engine: the
// halt one test provokes must not be what the next file starts under.
// Imported inside the hook: the tracer below has to replace the engine's
// modules before anything loads them.
afterEach(async () => {
  const core = (await import("@barqjs/core")) as unknown as { resetErrorHalt(): void };
  core.resetErrorHalt();
});

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
