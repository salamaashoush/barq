import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

import type { BunPlugin } from "bun"

const REPO = join(import.meta.dir, "..", "..", "..")

/** The barq runtime, as source: see `tier2/build.ts` for why never `dist`. */
export const BARQ_CORE = join(REPO, "packages", "core", "src", "index.ts")

/**
 * Resolves every `@barqjs/core` and `@barqjs/web` import in a bundle to the
 * source of the runtime whose core index is `core`, the compiled app's and the
 * renderer's own alike. Resolved by export condition instead, the renderer's
 * import of core takes `dist` while the app takes `src`, and the page carries
 * two engines.
 *
 * A checkout from before the renderer had a package of its own exports the
 * renderer from core, so there `@barqjs/web` lands on core too and an A/B
 * against such a baseline compiles one source for both sides.
 */
export function barqSource(core = BARQ_CORE): BunPlugin {
  const coreSrc = dirname(core)
  const webSrc = join(coreSrc, "..", "..", "web", "src")
  const split = existsSync(join(webSrc, "index.ts"))
  const entry = (name: string): string => join(name === "jsx-dev-runtime" ? "jsx-runtime" : name) + ".ts"
  const resolve = (pkg: string, sub: string | undefined): string => {
    if (pkg === "core") return sub === undefined ? core : join(coreSrc, entry(sub))
    if (split) return join(webSrc, entry(sub ?? "index"))
    return sub === undefined || sub === "host" ? core : join(coreSrc, entry(sub))
  }
  return {
    name: "barq-source",
    setup(build) {
      build.onResolve({ filter: /^@barqjs\/(core|web)(\/[\w-]+)?$/ }, (args) => {
        const [, pkg, sub] = /^@barqjs\/(core|web)(?:\/([\w-]+))?$/.exec(args.path)!
        return { path: resolve(pkg, sub) }
      })
    },
  }
}
