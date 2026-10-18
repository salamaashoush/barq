/** Print lines of an unminified page bundle, to name what a profile's line numbers point at. */
import { bundle } from "./bundle.ts"

const [side = "barq", ...lines] = process.argv.slice(2)
const text = (await bundle(`${side}.tsx`, { minify: false })).split("\n")
for (const line of lines) {
  const at = Number(line)
  console.log(`--- ${at}`)
  console.log(text.slice(at - 2, at + 6).join("\n"))
}
