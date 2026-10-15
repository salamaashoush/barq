/**
 * Solid 2.0, built from a local checkout, and the three compilers this lane
 * drives: barq's, Solid 2.0's native one, and `babel-preset-solid` for 1.9.
 *
 * Solid 2.0 is not a dependency of this package. `prepare.ts` builds a
 * solid-next checkout into `SOLID2_DIR`, and every bundle here resolves
 * `solid-js`, `@solidjs/web` and `@solidjs/signals` into that build through a
 * Bun plugin. Solid's own signals come with it: its runtime imports names the
 * published `@solidjs/signals` barq pins does not export, so the two engines
 * are each framework's own and the results file records both versions.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { homedir } from "node:os"
import { join } from "node:path"

import type { BunPlugin } from "bun"

import { compileBarq, compileSolid } from "../compile.ts"

const HERE = import.meta.dir
const REPO = join(HERE, "..", "..", "..", "..")

export const BARQ_CORE = join(REPO, "packages", "core", "src", "index.ts")
export const BARQ_SERVER = join(REPO, "packages", "server", "src", "index.ts")

export const SOLID_NEXT = process.env.SOLID_NEXT ?? join(homedir(), "Workspace", "vendor", "solid-next")
export const SOLID2_DIR =
  process.env.SOLID2_DIR ?? join(HERE, "..", "..", "node_modules", ".cache", "solid-next")

const pkg = (name: string) => join(SOLID2_DIR, "packages", name)

export function solid2Ready(): boolean {
  return (
    existsSync(join(pkg("solid"), "dist", "solid.js")) &&
    existsSync(join(pkg("web"), "dist", "web.js")) &&
    existsSync(join(pkg("signals"), "dist", "prod", "index.js")) &&
    existsSync(join(pkg("compiler"), "compiler.node"))
  )
}

function requireSolid2(): void {
  if (!solid2Ready()) {
    throw new Error(
      `no Solid 2.0 build at ${SOLID2_DIR}. Run \`bun run bench:solid2:prepare\` ` +
        "(SOLID_NEXT names the checkout, SOLID2_DIR where it is built).",
    )
  }
}

export function solid2Version(): { solid: string; signals: string; commit: string } {
  const read = (name: string) =>
    (JSON.parse(readFileSync(join(pkg(name), "package.json"), "utf8")) as { version: string })
      .version
  const commitFile = join(SOLID2_DIR, ".commit")
  return {
    solid: read("solid"),
    signals: read("signals"),
    commit: existsSync(commitFile) ? readFileSync(commitFile, "utf8").trim() : "unknown",
  }
}

export function barqSignalsVersion(): string {
  const require_ = createRequire(join(REPO, "packages", "core", "package.json"))
  return (require_("@solidjs/signals/package.json") as { version: string }).version
}

interface SolidNative {
  transform(
    code: string,
    options: { filename: string; generate: "dom" | "ssr"; hydratable: boolean },
  ): { code: string }
}

let native: SolidNative | undefined

export function compileSolid2(
  source: string,
  filename: string,
  generate: "dom" | "ssr",
  hydratable = false,
): string {
  requireSolid2()
  native ??= createRequire(import.meta.url)(join(pkg("compiler"), "index.js")) as SolidNative
  return native.transform(source, { filename, generate, hydratable }).code
}

export type Framework = "barq" | "solid2" | "solid1"

/**
 * Where Solid 2.0's specifiers land. Browser bundles get the client build, the
 * server bundle the string renderer; `solid-js/internal` is what
 * `@solidjs/web` reaches into.
 */
function solid2Plugin(target: "browser" | "server"): BunPlugin {
  const client = target === "browser"
  const files: Record<string, string> = {
    "solid-js": join(pkg("solid"), "dist", client ? "solid.js" : "server.js"),
    "solid-js/internal": join(pkg("solid"), "dist", "internal.js"),
    "@solidjs/web": join(pkg("web"), "dist", client ? "web.js" : "server.js"),
    "@solidjs/signals": join(pkg("signals"), "dist", "prod", "index.js"),
  }
  return {
    name: "solid2",
    setup(build) {
      build.onResolve({ filter: /^(solid-js|@solidjs\/web|@solidjs\/signals)(\/[\w-]+)?$/ }, (args) => {
        const path = files[args.path]
        if (path === undefined) throw new Error(`solid2: no mapping for ${args.path}`)
        return { path }
      })
    },
  }
}

const WORK = join(HERE, ".tmp")
rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })
writeFileSync(join(WORK, ".gitignore"), "*\n")
let seq = 0

/**
 * The shared app sources import from `solid-js` and `@solidjs/web`. barq
 * exports every name they use from `@barqjs/core`, so the barq build is the
 * same file with the two specifiers pointed there and nothing else changed.
 */
export function asBarq(source: string): string {
  return source.replaceAll('"solid-js"', '"@barqjs/core"').replaceAll('"@solidjs/web"', '"@barqjs/core"')
}

export interface CompileOptions {
  ssr?: boolean
  hydratable?: boolean
}

/**
 * `file` names the source with its extension, which decides whether the
 * output still carries TypeScript for the bundler to strip.
 */
export async function compileFor(
  framework: Framework,
  source: string,
  file: string,
  options: CompileOptions = {},
): Promise<{ code: string; ext: string }> {
  const ssr = options.ssr ?? false
  const hydratable = options.hydratable ?? false
  const typed = file.endsWith(".tsx")
  if (framework === "barq") {
    const code = compileBarq(asBarq(source), file.replace(/\.jsx$/, ".tsx"), ssr, hydratable)
    return {
      code: code
        .replaceAll('"@barqjs/core"', JSON.stringify(BARQ_CORE))
        .replaceAll('"@barqjs/server"', JSON.stringify(BARQ_SERVER)),
      ext: "ts",
    }
  }
  if (framework === "solid2") {
    return {
      code: compileSolid2(source, file, ssr ? "ssr" : "dom", hydratable),
      ext: typed ? "ts" : "js",
    }
  }
  if (typed) throw new Error(`${file}: the Solid 1.9 lane compiles JavaScript sources only`)
  const solid1 = source.replaceAll('"@solidjs/web"', '"solid-js/web"')
  return { code: await compileSolid(solid1, file, ssr ? "ssr" : "dom", hydratable), ext: "js" }
}

export interface BundleOptions {
  target: "browser" | "server"
  minify: boolean
}

/** One entry, bundled with the same bundler and settings for every framework. */
export async function bundleFor(
  framework: Framework,
  entryCode: string,
  ext: string,
  name: string,
  options: BundleOptions,
): Promise<string> {
  const entry = join(WORK, `${name}-${framework}-${seq++}.${ext}`)
  writeFileSync(entry, entryCode)
  const browser = options.target === "browser"
  const built = await Bun.build({
    entrypoints: [entry],
    target: browser ? "browser" : "bun",
    format: "esm",
    minify: options.minify,
    sourcemap: "none",
    conditions: browser ? ["browser"] : ["node"],
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: framework === "solid2" ? [solid2Plugin(options.target)] : [],
  })
  if (!built.success) {
    throw new Error(`bundling ${name} for ${framework} failed:\n${built.logs.map(String).join("\n")}`)
  }
  return built.outputs[0].text()
}

/** Write a server bundle to disk and import it, so SSR runs the bundled code. */
export async function importBundle<T>(code: string, name: string): Promise<T> {
  const file = join(WORK, `${name}-${seq++}.mjs`)
  writeFileSync(file, code)
  return (await import(file)) as T
}

export const APPS = join(HERE, "apps")
export const appSource = (file: string) => readFileSync(join(APPS, file), "utf8")
