// FIRST, and in its own module. See `./register-dom.ts` for why the
// registration cannot live in this file's body.
import * as dom from "./register-dom.ts";

void dom;

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
