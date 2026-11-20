import * as dom from "./register-dom.ts";

void dom;

import { plugin } from "bun";
import { compilerLoader } from "@barqjs/vite/internal";

plugin(compilerLoader({ transform: { dev: true } }));

// Importing `@barqjs/testing` registers its `afterEach(cleanup)`. bun shares one
// module registry across a run, so it has to happen here, not in a test file.
import * as testing from "@barqjs/testing";

void testing;
