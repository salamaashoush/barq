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
