/**
 * Bundling for the Tier-2 lane.
 *
 * Two rules, both of which exist because getting either wrong silently changes
 * what is being measured:
 *
 *  1. **Both sides go through their real compiler.** The barq app is JSX that
 *     `@barqjs/compiler-rs` compiles; the Solid app is JSX that
 *     `babel-preset-solid` compiles. `src/compile.ts` already owns that and
 *     says why. A hand-written "shape the compiler would emit" measures the
 *     benchmark author's memory of the compiler.
 *  2. **barq resolves to SOURCE, not to `dist`.** `packages/core`'s `import`
 *     condition points at `dist/index.js`, which is a build artefact that can
 *     be older than the `signals.ts` a claim is about. An ablation run bisects
 *     `signals.ts`; if the bundle were reading `dist` the ablation would change
 *     nothing and report "no effect", which is the most dangerous possible
 *     result — a real difference measured as a null.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { compileBarq, compileSolid } from "../compile.ts"

const HERE = import.meta.dir
const REPO = join(HERE, "..", "..", "..", "..")

/** The barq runtime, as source. See rule 2 above. */
export const BARQ_CORE = join(REPO, "packages", "core", "src", "index.ts")

const WORK = join(HERE, ".tmp")

rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })
writeFileSync(join(WORK, ".gitignore"), "*\n")

let seq = 0

export interface Bundle {
  /** path -> body, ready for `serve()`. */
  files: Map<string, string>
  /** The entry document's path. */
  page: string
}

function html(title: string, script: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body><div id="main"><div class="container"></div></div>
<script type="module" src="${script}"></script>
</body></html>
`
}

async function bundle(entryPath: string, name: string): Promise<string> {
  const built = await Bun.build({
    entrypoints: [entryPath],
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "none",
    conditions: ["browser"],
    define: { "process.env.NODE_ENV": '"production"' },
  })
  if (!built.success) {
    throw new Error(`bundling ${name} failed:\n${built.logs.map(String).join("\n")}`)
  }
  return built.outputs[0].text()
}

/** A page whose entry is TypeScript/JS needing no JSX compiler. */
export async function plainPage(source: string, name: string): Promise<Bundle> {
  const entry = join(WORK, `${name}-${seq++}.ts`)
  writeFileSync(entry, source.replaceAll('"@barqjs/core"', JSON.stringify(BARQ_CORE)))
  const code = await bundle(entry, name)
  return {
    files: new Map([
      ["/index.html", html(name, "/app.js")],
      ["/app.js", code],
    ]),
    page: "/index.html",
  }
}

/** A page whose entry is barq JSX, compiled by the real native compiler. */
export async function barqPage(source: string, name: string): Promise<Bundle> {
  const compiled = compileBarq(source, `${name}.tsx`, false).replaceAll(
    '"@barqjs/core"',
    JSON.stringify(BARQ_CORE),
  )
  // `.ts`, not `.js`: the barq compiler transforms JSX and leaves TypeScript
  // annotations for the bundler, so an entry named `.js` is a parse error and
  // not a compile failure — which is a confusing way to learn this.
  const entry = join(WORK, `${name}-${seq++}.ts`)
  writeFileSync(entry, compiled)
  const code = await bundle(entry, name)
  return {
    files: new Map([
      ["/index.html", html(name, "/app.js")],
      ["/app.js", code],
    ]),
    page: "/index.html",
  }
}

/** A page whose entry is Solid JSX, compiled by `babel-preset-solid`. */
export async function solidPage(source: string, name: string): Promise<Bundle> {
  const compiled = await compileSolid(source, `${name}.jsx`, "dom")
  const entry = join(WORK, `${name}-${seq++}.js`)
  writeFileSync(entry, compiled)
  const code = await bundle(entry, name)
  return {
    files: new Map([
      ["/index.html", html(name, "/app.js")],
      ["/app.js", code],
    ]),
    page: "/index.html",
  }
}
