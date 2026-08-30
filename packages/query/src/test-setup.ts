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
import { cssRegistration } from "@barqjs/compiler";

interface Native {
  transform(
    code: string,
    options?: Record<string, unknown>,
  ): { code: string; warnings: string[]; css?: string };
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
      // AND its stylesheet: there is no bundler here to emit an asset, so a
      // compiled block's CSS arrives the way it does in dev, appended to the
      // module and keyed by its id.
      const css =
        out.css === undefined || out.css === "" ? "" : cssRegistration(args.path, out.css);
      return { contents: out.code + css, loader: "ts" };
    });
  },
});
