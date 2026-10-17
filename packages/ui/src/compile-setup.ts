// FIRST. See `./register-dom.ts` for why the registration cannot live here.
import * as dom from "./register-dom.ts";

void dom;

import { compilerLoader } from "@barqjs/vite/internal";
import { plugin } from "bun";

/**
 * The DOM and the compiler, for anything that loads this package's sources: the
 * suite, and the tools that read the stylesheet the components register.
 *
 * Nothing here needs a test runner. What does is in `./test-setup.ts`, which a
 * tool must not preload: a runner hook called outside the runner throws.
 *
 * This package's own suite goes through the COMPILER, like every consumer does.
 *
 * Every `.tsx` goes through it, this package's and `@barqjs/aria`'s alike:
 * bun's own `react-jsx` transform cannot produce scope-taking Blocks, so a
 * component lowered that way gets DIFFERENT semantics — props arrive as plain
 * values rather than Cells, and children are built eagerly instead of lazily.
 *
 * `.ts` goes through it as well, which the other packages do not need: a `css`
 * block in a `.ts` module is a class name only once the compiler has folded it,
 * and a suite running the runtime fallback there would measure a path no built
 * application takes. That one is anchored on THIS package's `src`, because a
 * bare `\.ts$` would also claim `@barqjs/core`'s sources — which resolve to
 * `src` under bun and have no business going through a second transform.
 */
const ownTs = new RegExp(`^${import.meta.dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/.*\\.ts$`);

/**
 * The same transform, for a `Bun.build` of its own.
 *
 * `plugin()` registers with the test runner's loader and a `Bun.build` inside a
 * test does not inherit it — so a suite that bundles this package would get raw
 * JSX. `tree-shaking.test.ts` is that suite, and it now bundles the SOURCE,
 * because source is what this package publishes.
 *
 * `strictCss` here as well as in `tsdown.config.ts` and the gallery, or the
 * suite compiles this package's sources under different rules from the build
 * and a call that fails one passes the other.
 */
export const barqPlugin = compilerLoader({ transform: { strictCss: true }, ts: ownTs });

plugin(barqPlugin);
