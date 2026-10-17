/**
 * happy-dom globals, then the barq compiler as a `bun test` loader.
 *
 * A `.tsx` test has to be COMPILED like any other consumer. Left to bun's own
 * `react-jsx` transform it reaches the runtime through a second implementation
 * of component invocation, so the suite sees the declaration half and never the
 * invocation half.
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

import { plugin } from "bun";
import { compilerLoader } from "@barqjs/vite/internal";

plugin(compilerLoader({ transform: { dev: true } }));
