/**
 * Hydration time: the storefront page served as each framework's own
 * hydratable SSR output, then claimed in Chrome by its own client build.
 *
 * The page times `hydrate()` from the call to the end of the microtask queue,
 * so deferred effect work is inside the number, and then proves the claim
 * took: one card's button is clicked and the cart count has to move, with
 * exactly the server's hundred cards in the DOM. A hydration that rebuilt the
 * page or attached nothing fails here instead of posting a time.
 */
import { load, serve, withBenchChrome } from "../tier2/driver.ts"
import { summarize, type Summary } from "../stats.ts"
import { appSource, bundleFor, compileFor, type Framework } from "./solid2.ts"
import { serverModule } from "./ssr.ts"

const HYDRATE_FROM: Record<Framework, string> = {
  barq: "@barqjs/web",
  solid2: "@solidjs/web",
  solid1: "solid-js/web",
}

function clientFooter(framework: Framework): string {
  return `
import { hydrate as __hydrate } from "${HYDRATE_FROM[framework]}"
const __run = async () => {
  const start = performance.now()
  __hydrate(() => <App data={globalThis.__DATA__} />, document.getElementById("root"))
  for (let i = 0; i < 4; i++) await Promise.resolve()
  return performance.now() - start
}
if (location.search === "?later") {
  globalThis.__hydrateLater = __run
  globalThis.__ready = true
} else {
  globalThis.__hydrateMs = await __run()
  globalThis.__ready = true
}
`
}

const CHECK = `(async () => {
  const cards = document.querySelectorAll("article.card").length
  document.querySelector("article.card button.add").click()
  for (let i = 0; i < 4; i++) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const summary = document.querySelector("p.summary").textContent
  return { cards, summary }
})()`

async function pageFor(framework: Framework, items: number): Promise<Map<string, string>> {
  const server = await serverModule(framework, true)
  const data = server.makeData(items)
  const { head, html } = server.document(data)
  const file = framework === "barq" ? "page-barq.tsx" : "page.jsx"
  const { code, ext } = await compileFor(framework, appSource(file) + clientFooter(framework), file, {
    hydratable: true,
  })
  const js = await bundleFor(framework, code, ext, "page-client", { target: "browser", minify: true })
  const document = `<!doctype html>
<html><head><meta charset="utf-8"><title>hydrate ${framework}</title>${head}</head>
<body><div id="root">${html}</div>
<script>globalThis.__DATA__ = ${JSON.stringify(data)}</script>
<script type="module" src="/app.js"></script>
</body></html>
`
  return new Map([
    ["/index.html", document],
    ["/app.js", js],
  ])
}

/**
 * `atLoad` is the call made as the entry module runs, the way a page does it,
 * and carries the first execution of every function the claim reaches.
 * `afterLoad` is the same call made once the page is idle and collected, which
 * is the claim's own work.
 */
export interface HydrateSide {
  atLoad: Summary
  afterLoad: Summary
}

export async function runHydrate(
  frameworks: readonly Framework[],
  options: { items: number; loads: number; throttle: number },
): Promise<Partial<Record<Framework, HydrateSide>>> {
  const servers = new Map<Framework, ReturnType<typeof serve>>()
  for (const framework of frameworks) servers.set(framework, serve(await pageFor(framework, options.items)))
  try {
    return await withBenchChrome(async (tab) => {
      for (const framework of frameworks) {
        await load(tab, servers.get(framework)!.url("/index.html"))
        const { cards, summary } = await tab.evaluate<{ cards: number; summary: string }>(CHECK)
        if (cards !== options.items || !summary.includes("1 in cart")) {
          throw new Error(
            `${framework} did not hydrate the page: ${cards} cards, summary ${JSON.stringify(summary)}`,
          )
        }
      }
      await tab.throttle(options.throttle)
      const atLoad = new Map<Framework, number[]>(frameworks.map((f) => [f, []]))
      const later = new Map<Framework, number[]>(frameworks.map((f) => [f, []]))
      for (let i = 0; i < options.loads; i++) {
        for (let k = 0; k < frameworks.length; k++) {
          const framework = frameworks[(i + k) % frameworks.length]
          const url = servers.get(framework)!.url("/index.html")
          await load(tab, url)
          atLoad.get(framework)!.push(await tab.evaluate<number>("globalThis.__hydrateMs"))
          await load(tab, `${url}?later`)
          await tab.evaluate("globalThis.gc && globalThis.gc()")
          later.get(framework)!.push(await tab.evaluate<number>("globalThis.__hydrateLater()"))
        }
      }
      await tab.throttle(1)
      const out: Partial<Record<Framework, HydrateSide>> = {}
      for (const framework of frameworks) {
        out[framework] = {
          atLoad: summarize(atLoad.get(framework)!),
          afterLoad: summarize(later.get(framework)!),
        }
      }
      const line = (f: Framework, key: keyof HydrateSide) =>
        ` ${f} ${out[f]![key].median.toFixed(2)} (p25 ${out[f]![key].p25.toFixed(2)} p75 ${out[f]![key].p75.toFixed(2)})`
      const cpu = options.throttle > 1 ? `  ${options.throttle}x CPU` : ""
      console.log(`  hydrate at load, ${options.items} cards ` + frameworks.map((f) => line(f, "atLoad")).join(" ") + cpu)
      console.log(`  hydrate after load       ` + frameworks.map((f) => line(f, "afterLoad")).join(" ") + cpu)
      return out
    })
  } finally {
    for (const server of servers.values()) server.stop()
  }
}
