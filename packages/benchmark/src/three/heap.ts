/**
 * What 10k mounted meshes hold, by constructor: two heap snapshots, before
 * and after `__bench.mount(10000)`, and the difference in retained-by-type
 * self size, largest first.
 *
 *   CHROME_PATH=... bun run src/three/heap.ts barq|r3f
 */
import { load, serve, withBenchChrome, type Page } from "../tier2/driver.ts"
import { bundle } from "./bundle.ts"

const side = process.argv[2] ?? "barq"
const served = serve(
  new Map([
    [
      "/p.html",
      '<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="app"></div><script type="module" src="/p.js"></script>',
    ],
    ["/p.js", await bundle(`${side}.tsx`, { minify: false })],
  ]),
)

async function snapshot(page: Page): Promise<Map<string, { size: number; count: number }>> {
  await page.send("HeapProfiler.collectGarbage", {})
  const chunks: string[] = []
  const off = page.on("HeapProfiler.addHeapSnapshotChunk", (params) => {
    chunks.push(params.chunk as string)
  })
  await page.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false })
  off()
  const data = JSON.parse(chunks.join("")) as {
    snapshot: {
      meta: { node_fields: string[]; node_types: [string[]]; edge_fields: string[]; edge_types: [string[]] }
    }
    nodes: number[]
    edges: number[]
    strings: string[]
  }
  const fields = data.snapshot.meta.node_fields
  const width = fields.length
  const typeAt = fields.indexOf("type")
  const nameAt = fields.indexOf("name")
  const sizeAt = fields.indexOf("self_size")
  const types = data.snapshot.meta.node_types[0]
  const out = new Map<string, { size: number; count: number }>()
  const edgeWidth = data.snapshot.meta.edge_fields.length
  const edgeTypes = data.snapshot.meta.edge_types[0]
  const countAt = fields.indexOf("edge_count")
  let edge = 0
  for (let i = 0; i < data.nodes.length; i += width) {
    const type = types[data.nodes[i + typeAt]]
    const name = type === "object" || type === "closure" ? data.strings[data.nodes[i + nameAt]] : `(${type})`
    const edges = data.nodes[i + countAt]
    let shape = ""
    if (name === "Object" || name === "system / Context") {
      const names: string[] = []
      for (let e = 0; e < edges && names.length < 6; e++) {
        const at = edge + e * edgeWidth
        const kind = edgeTypes[data.edges[at]]
        if (kind === "property" || kind === "context") names.push(data.strings[data.edges[at + 1]])
      }
      shape = `{${names.join(",")}}`
    }
    edge += edges * edgeWidth
    const key = `${type}:${name}${shape}`
    const entry = out.get(key) ?? { size: 0, count: 0 }
    entry.size += data.nodes[i + sizeAt]
    entry.count++
    out.set(key, entry)
  }
  return out
}

await withBenchChrome(
  async (page) => {
    await load(page, served.url("/p.html"))
    await page.send("HeapProfiler.enable", {})
    const before = await snapshot(page)
    await page.call("__bench.mount(10000)")
    const after = await snapshot(page)
    const rows: [string, number, number][] = []
    let total = 0
    for (const [key, entry] of after) {
      const base = before.get(key) ?? { size: 0, count: 0 }
      const size = entry.size - base.size
      total += size
      rows.push([key, size, entry.count - base.count])
    }
    rows.sort((a, b) => b[1] - a[1])
    console.log(`total ${(total / 2 ** 20).toFixed(2)} MB`)
    for (const [key, size, count] of rows.slice(0, 35)) {
      console.log(`${(size / 1024).toFixed(0).padStart(8)} KB ${String(count).padStart(7)}  ${key}`)
    }
  },
  { flags: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
)
served.stop()
