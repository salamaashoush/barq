/**
 * SSR throughput: `apps/page.jsx` rendered to a string and to a stream by each
 * framework's own server build, compiled by its own compiler and bundled by
 * the same bundler.
 *
 * Every framework renders in this one process, interleaved round by round
 * with a forced GC before each timed round, so a round's garbage is not billed
 * to the next framework. The reported number is the median of the per-round
 * renders per second; the spread across rounds is reported beside it.
 */
import { summarize, type Summary } from "../stats.ts"
import { appSource, bundleFor, compileFor, importBundle, type Framework } from "./solid2.ts"

const FOOTERS: Record<Framework, string> = {
  barq: `
import { renderToString as __toString, renderToStream as __toStream, generateHydrationScript as __script } from "@barqjs/server"
export const toString = (data) => __toString(() => <App data={data} />)
export const toReadable = (data) => __toStream(() => <App data={data} />)
export const document = (data) => {
  const html = __toString(() => <App data={data} />)
  return { head: __script(), html }
}
`,
  solid2: `
import { renderToString as __toString, renderToStream as __toStream, generateHydrationScript as __script } from "@solidjs/web"
export const toString = (data) => __toString(() => <App data={data} />)
export const toReadable = (data) => __toStream(() => <App data={data} />).readable
export const document = (data) => {
  let head = ""
  const html = __toString(() => <App data={data} />, { onHead: (h) => (head = h) })
  return { head: __script() + head, html }
}
`,
  solid1: `
import { renderToString as __toString, renderToStream as __toStream, generateHydrationScript as __script } from "solid-js/web"
export const toString = (data) => __toString(() => <App data={data} />)
export const toReadable = (data) => {
  const { readable, writable } = new TransformStream()
  __toStream(() => <App data={data} />).pipeTo(writable)
  return readable
}
export const document = (data) => ({ head: __script(), html: __toString(() => <App data={data} />) })
`,
}

export interface ServerModule {
  toString(data: unknown): string
  toReadable(data: unknown): ReadableStream<Uint8Array>
  document(data: unknown): { head: string; html: string }
  makeData(count: number): unknown
}

export async function serverModule(framework: Framework, hydratable: boolean): Promise<ServerModule> {
  const file = framework === "barq" ? "page-barq.tsx" : "page.jsx"
  const source = appSource(file) + FOOTERS[framework]
  const { code, ext } = await compileFor(framework, source, file, { ssr: true, hydratable })
  const bundled = await bundleFor(framework, code, ext, "page-server", { target: "server", minify: false })
  return importBundle<ServerModule>(bundled, `page-server-${framework}`)
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<number> {
  let bytes = 0
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return bytes
    bytes += value.byteLength
  }
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', "#39": "'", amp: "&" }

/** The visible text of a render, so the frameworks can be checked against each other. */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(lt|gt|quot|#39|amp);/g, (_, name: string) => ENTITIES[name])
    .replace(/\s+/g, " ")
    .trim()
}

export interface SsrSide {
  stringPerSecond: Summary
  streamPerSecond: Summary
  bytes: number
}

export async function runSsr(
  frameworks: readonly Framework[],
  options: { items: number; rounds: number; perRound: number; warmup: number },
): Promise<Partial<Record<Framework, SsrSide>>> {
  const modules = new Map<Framework, ServerModule>()
  for (const framework of frameworks) modules.set(framework, await serverModule(framework, false))
  const data = new Map<Framework, unknown>()
  for (const [framework, mod] of modules) data.set(framework, mod.makeData(options.items))

  let expected: string | undefined
  const bytes = new Map<Framework, number>()
  for (const [framework, mod] of modules) {
    const html = mod.toString(data.get(framework))
    const text = visibleText(html)
    expected ??= text
    if (text !== expected) {
      throw new Error(
        `${framework} rendered different text from ${frameworks[0]}:\n${text.slice(0, 400)}\n---\n${expected.slice(0, 400)}`,
      )
    }
    const streamed = await drain(mod.toReadable(data.get(framework)))
    if (streamed < html.length * 0.9) {
      throw new Error(`${framework} streamed ${streamed} bytes against a ${html.length}-byte string`)
    }
    bytes.set(framework, Buffer.byteLength(html))
  }

  for (const [framework, mod] of modules) {
    for (let i = 0; i < options.warmup; i++) {
      mod.toString(data.get(framework))
      await drain(mod.toReadable(data.get(framework)))
    }
  }

  const strings = new Map<Framework, number[]>(frameworks.map((f) => [f, []]))
  const streams = new Map<Framework, number[]>(frameworks.map((f) => [f, []]))
  for (let round = 0; round < options.rounds; round++) {
    for (let k = 0; k < frameworks.length; k++) {
      const framework = frameworks[(round + k) % frameworks.length]
      const mod = modules.get(framework)!
      const input = data.get(framework)
      Bun.gc(true)
      let start = Bun.nanoseconds()
      for (let i = 0; i < options.perRound; i++) mod.toString(input)
      strings.get(framework)!.push(options.perRound / ((Bun.nanoseconds() - start) / 1e9))
      Bun.gc(true)
      start = Bun.nanoseconds()
      for (let i = 0; i < options.perRound; i++) await drain(mod.toReadable(input))
      streams.get(framework)!.push(options.perRound / ((Bun.nanoseconds() - start) / 1e9))
    }
  }

  const out: Partial<Record<Framework, SsrSide>> = {}
  for (const framework of frameworks) {
    out[framework] = {
      stringPerSecond: summarize(strings.get(framework)!),
      streamPerSecond: summarize(streams.get(framework)!),
      bytes: bytes.get(framework)!,
    }
    const side = out[framework]
    console.log(
      `  ${framework.padEnd(8)} renderToString ${side.stringPerSecond.median.toFixed(0)}/s ` +
        `(sd ${side.stringPerSecond.sd.toFixed(0)})  stream ${side.streamPerSecond.median.toFixed(0)}/s ` +
        `(sd ${side.streamPerSecond.sd.toFixed(0)})  ${side.bytes} B`,
    )
  }
  return out
}
