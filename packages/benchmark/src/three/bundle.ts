/**
 * The pages `run.ts` measures, bundled the way an application's build would:
 * barq through `@barqjs/compiler` with what `@barqjs/vite` discovers in
 * `@barqjs/three`'s `package.json` (`<Canvas>`'s children and trees of three's
 * tags for the scene, the rest for the document), React through Bun's JSX
 * transform, both against production builds.
 */
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

import type { BunPlugin } from "bun"

const APPS = join(import.meta.dir, "apps")
const THREE_PACKAGE = join(import.meta.dir, "..", "..", "..", "three")

const require_ = createRequire(import.meta.url)
const native = require_("@barqjs/compiler") as {
  transform(code: string, options: Record<string, unknown>): { code: string; warnings: string[] }
}

interface Manifest {
  name: string
  barq: {
    boundaries: { name: string; target: string; moduleSource: string }[]
    intrinsics: { tags: string; claimUnknown?: boolean; target: string; moduleSource: string }[]
  }
}

const manifest = JSON.parse(readFileSync(join(THREE_PACKAGE, "package.json"), "utf8")) as Manifest
const boundaries = manifest.barq.boundaries.map((entry) => ({ source: manifest.name, ...entry }))
// The tags file is the package's build output: `bun run build:packages` writes it.
const intrinsics = manifest.barq.intrinsics.map((entry) => ({
  ...entry,
  tags: JSON.parse(readFileSync(join(THREE_PACKAGE, entry.tags), "utf8")) as string[],
}))

const barqCompiler: BunPlugin = {
  name: "barq-three-bench",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text()
      if (source.includes("@jsxImportSource react")) return { contents: source, loader: "tsx" }
      const result = native.transform(source, { filename: args.path, boundaries, intrinsics })
      if (result.warnings.length > 0) throw new Error(`${args.path}: ${result.warnings.join("; ")}`)
      return { contents: result.code, loader: "tsx" }
    })
  },
}

export async function bundle(
  entry: string,
  options: { minify?: boolean; external?: string[] } = {},
): Promise<string> {
  const built = await Bun.build({
    entrypoints: [join(APPS, entry)],
    target: "browser",
    format: "esm",
    minify: options.minify ?? true,
    conditions: ["bun"],
    external: options.external ?? [],
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [barqCompiler],
  })
  if (!built.success) throw new Error(built.logs.map(String).join("\n"))
  return built.outputs[0].text()
}
