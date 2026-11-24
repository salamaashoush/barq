import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

import { dirname } from "node:path";
import { plugin } from "bun";
import { compilerLoader } from "@barqjs/vite/internal";

import { installCanvas } from "./test-canvas.ts";

installCanvas();

// `.ts` goes through the compiler for the UI's styles and for `@barqjs/ui`'s,
// which the UI is built on: a `css` call in a `.ts` module is a class name
// only once the compiler has folded it.
function escape(path: string): string {
  return path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const ui = dirname(Bun.resolveSync("@barqjs/ui/package.json", import.meta.dir));
const arc = dirname(Bun.resolveSync("@barqjs/arc/package.json", import.meta.dir));
const styled = new RegExp(
  `^(${escape(`${import.meta.dir}/ui`)}|${escape(ui)}/src|${escape(arc)}/src/style)/.*\\.ts$|^${escape(arc)}/src/layer\\.ts$`,
);

plugin(compilerLoader({ transform: { dev: true, hydratable: true, strictCss: true }, ts: styled }));
