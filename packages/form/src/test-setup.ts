import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

import { createRequire } from "node:module";
import { plugin } from "bun";
import { cssRegistration } from "@barqjs/vite/internal";

interface Native {
  transform(
    code: string,
    options?: Record<string, unknown>,
  ): { code: string; warnings: string[]; css?: string };
}

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as Native;

// A `.tsx` test is compiled by the barq compiler like any consumer: bun's own
// JSX transform cannot produce the Blocks and Cells components are called with.
plugin({
  name: "barq-compiler",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const out = native.transform(source, { filename: args.path, dev: true });
      if (out.warnings.length > 0) {
        console.warn(`[barq] ${args.path}\n  ${out.warnings.join("\n  ")}`);
      }
      const css =
        out.css === undefined || out.css === "" ? "" : cssRegistration(args.path, out.css);
      return { contents: out.code + css, loader: "ts" };
    });
  },
});
