// FIRST. See `./register-dom.ts` for why the registration cannot live here.
import * as dom from "./register-dom.ts";

void dom;

import { dirname } from "node:path";
import { compilerLoader } from "@barqjs/vite/internal";
import { plugin } from "bun";

/**
 * The DOM and the compiler, for this package's suite.
 *
 * `.ts` goes through the compiler for arc's own sources and for
 * `@barqjs/ui`'s, which arc builds on: a `css` block in a `.ts` module is a
 * class name only once the compiler has folded it, and a suite running the
 * runtime fallback would measure a path no built application takes.
 */
function escape(path: string): string {
  return path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const ui = dirname(Bun.resolveSync("@barqjs/ui/package.json", import.meta.dir));
const ownTs = new RegExp(`^(${escape(import.meta.dir)}|${escape(ui)}/src)/.*\\.ts$`);

export const barqPlugin = compilerLoader({ transform: { strictCss: true }, ts: ownTs });

plugin(barqPlugin);
