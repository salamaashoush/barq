/**
 * Test setup - registers happy-dom globals before tests run
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";
import { resetErrorHalt, followAsync } from "@barqjs/core";
import { installDevConsole } from "../../core/src/dev-console.ts";

// Register happy-dom globals (document, window, etc.)
GlobalRegistrator.register();

// Under the `development` condition `@barqjs/core` resolves to its development
// entry, which prints every diagnostic. The suite reads them off the channel,
// and the tests about the console install it themselves.
installDevConsole()();

// Tests await graphs they build by hand, so async memos are followed here the
// way a server render follows its own.
followAsync(true);

// An error nothing catches halts the reactive engine for good and is handed to
// `reportError`, which is what a crashed page should do. A test that provokes
// one has already asserted on it: the halt must not reach the next test, and
// the report must not fail the run from between two of them.
globalThis.reportError = () => {};
afterEach(() => {
  resetErrorHalt();
});
