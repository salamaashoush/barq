/**
 * The pages `run.ts` measures, bundled the way an application's build would:
 * barq through `@barqjs/compiler` (a `*.scene.tsx` for the three renderer,
 * anything else for the document), React through Bun's JSX transform, both
 * against production builds.
 */
import { createRequire } from "node:module"
import { join } from "node:path"

import type { BunPlugin } from "bun"

const APPS = join(import.meta.dir, "apps")

const native = createRequire(import.meta.url)("@barqjs/compiler") as {
  transform(code: string, options: Record<string, unknown>): { code: string; warnings: string[] }
}

const barqCompiler: BunPlugin = {
  name: "barq-three-bench",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text()
      if (source.includes("@jsxImportSource react")) return { contents: source, loader: "tsx" }
      const result = native.transform(source, {
        filename: args.path,
        renderers: [
          { include: ["*.scene.tsx"], target: "universal", moduleSource: "@barqjs/three/renderer" },
        ],
      })
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
