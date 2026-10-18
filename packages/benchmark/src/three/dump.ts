/**
 * Print part of an unminified page bundle: around given line numbers (to name
 * what a profile points at), or from the first occurrence of a string.
 *
 *   bun run src/three/dump.ts barq 47080 1413
 *   bun run src/three/dump.ts barq "function Scene()"
 */
import { bundle } from "./bundle.ts"

const [side = "barq", ...queries] = process.argv.slice(2)
const source = await bundle(`${side}.tsx`, { minify: false })
const text = source.split("\n")
for (const query of queries) {
  const at = Number(query)
  if (Number.isNaN(at)) {
    const index = source.indexOf(query)
    console.log(`--- ${query}`)
    console.log(index === -1 ? "(not found)" : source.slice(index, index + 2400))
    continue
  }
  console.log(`--- ${at}`)
  console.log(text.slice(at - 2, at + 6).join("\n"))
}
