/**
 * Test setup - registers happy-dom globals before tests run
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register happy-dom globals (document, window, etc.)
GlobalRegistrator.register();
