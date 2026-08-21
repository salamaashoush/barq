/**
 * Test setup for `@barqjs/router`.
 *
 * Two things, and the second is the milestone's:
 *
 *  1. happy-dom globals, registered before anything captures them.
 *  2. **the barq compiler, wired into `bun test`.** §11 Q2 deletes the
 *     un-compiled authoring path, so a test file that writes JSX has to be
 *     COMPILED like any other consumer. Until M8 this package went through
 *     Bun's `react-jsx` transform into `@barqjs/core/jsx-runtime` — a second
 *     implementation of component invocation, which is the root cause the whole
 *     redesign exists to remove. Now the router's `.tsx` tests reach the runtime
 *     through exactly the emission `packages/kitchen-sink` reaches it through,
 *     so the suite can see the invocation half rather than only the declaration
 *     half.
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

// A real origin, so `history.pushState` and `window.location` behave. The
// default is `about:blank`, where `location.pathname` reads "blank".
GlobalRegistrator.register({ url: "http://localhost/" });

import { createRequire } from "node:module";
import { plugin } from "bun";

interface Native {
  transform(code: string, options?: Record<string, unknown>): { code: string; warnings: string[] };
}

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as Native;

plugin({
  name: "barq-compiler",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const out = native.transform(source, { filename: args.path, dev: true });
      if (out.warnings.length > 0) {
        console.warn(`[barq] ${args.path}\n  ${out.warnings.join("\n  ")}`);
      }
      return { contents: out.code, loader: "ts" };
    });
  },
});
