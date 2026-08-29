import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "http://localhost/" });

import { createRequire } from "node:module";
import { plugin } from "bun";

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as {
  transform(code: string, options?: Record<string, unknown>): { code: string; warnings: string[] };
};

plugin({
  name: "barq-compiler-hydratable",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const out = native.transform(source, { filename: args.path, dev: true, hydratable: true });
      return { contents: out.code, loader: "ts" };
    });
  },
});
