import { createRequire } from "node:module";
import { plugin } from "bun";

interface Native {
  transform(code: string, options?: Record<string, unknown>): { code: string };
}

const globals = [typeof window, typeof document, typeof ResizeObserver];
const native = createRequire(import.meta.url)("@barqjs/compiler-rs") as Native;

plugin({
  name: "barq-compiler-ssr",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const out = native.transform(source, { filename: args.path, ssr: true });
      return { contents: out.code, loader: "ts" };
    });
  },
});

const page = await import("./ssr-page.tsx");

console.log(
  JSON.stringify({
    globals,
    element: page.renderElementList(),
    window: page.renderWindowList(),
  }),
);
