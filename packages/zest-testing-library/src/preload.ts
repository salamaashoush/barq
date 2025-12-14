import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Must register before any other imports that might use DOM
GlobalRegistrator.register();

import { afterEach } from "bun:test";
import { cleanup } from "./index.ts";

// Auto-cleanup after each test
afterEach(() => {
  cleanup();
});
