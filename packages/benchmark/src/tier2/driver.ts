/**
 * Tier 2: a real Chrome, a real DOM, real layout and real paint.
 *
 * `CODESIGN.md` §12 records the gap this closes. Every number in that document
 * is Tier 1 — Node microbenchmarks, a stub DOM, happy-dom — including §0.3's
 * defence of the calling convention, whose conclusion ("0% through a DOM") is a
 * claim about a real browser made without ever running one. happy-dom has
 * hidden four distinct bug classes on this project already; it is not the
 * oracle for a performance claim either.
 *
 * This file is the page half: an origin to serve from, cross-origin isolation
 * so the clock is worth reading, and `afterFrame` for the places that need to
 * know a frame has been committed.
 */
import { readFileSync } from "node:fs"
import { extname } from "node:path"

import { withBenchChrome, type Page } from "./cdp.ts"

export { withBenchChrome, type Page }

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
}

/**
 * Cross-origin isolation, and it is not optional.
 *
 * Without these two headers Chrome coarsens `performance.now()` to 100 µs as a
 * Spectre mitigation. The first cut of `apps/shapes.ts` reported every one of
 * nine shapes as 0.200 or 0.300 ms and three of them as exactly 1.000x the
 * baseline — a clean sweep of ties that was the quantiser, not a result. With
 * `Cross-Origin-Opener-Policy: same-origin` and
 * `Cross-Origin-Embedder-Policy: require-corp` the page is isolated and the
 * clock goes back to 5 µs.
 */
const ISOLATION = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin",
}

export interface Served {
  url(path: string): string
  stop(): void
}

/**
 * Serve an in-memory file set on a real origin.
 *
 * An origin because `about:blank` and `data:` URLs are opaque, module scripts
 * do not load there, and cross-origin isolation is not expressible. In memory
 * rather than a temp directory because the bundles are produced by `Bun.build`
 * into memory already, and writing them out only adds a way for a stale file to
 * be served to a run that believes it rebuilt.
 */
export function serve(files: Map<string, string>): Served {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      const body = files.get(path) ?? files.get(`${path}/index.html`)
      if (body === undefined) return new Response(`no ${path}`, { status: 404 })
      const type = CONTENT_TYPES[extname(path)] ?? "application/octet-stream"
      return new Response(body, {
        headers: { "content-type": type, "cache-control": "no-store", ...ISOLATION },
      })
    },
  })
  return {
    url: (path) => `http://127.0.0.1:${server.port}${path}`,
    stop: () => server.stop(true),
  }
}

/** `afterFrame`, installed. See `vendor/afterframe.js` for why it is not rAF. */
const AFTER_FRAME = readFileSync(new URL("./vendor/afterframe.js", import.meta.url), "utf8")

/**
 * Load a benchmark page: navigate, install `afterFrame`, wait for `__ready`,
 * and refuse a page that is not cross-origin isolated — because a page that
 * silently lost isolation reports a coarsened clock and nothing else changes.
 */
export async function load(page: Page, url: string, timeoutMs = 60_000): Promise<void> {
  await page.navigate(url)
  await page.evaluate(AFTER_FRAME)
  const isolated = await page.evaluate<boolean>("crossOriginIsolated === true")
  if (!isolated) {
    throw new Error(
      `${url} is not cross-origin isolated, so performance.now() is quantised to 100 µs ` +
        "and every microbenchmark on this page is a measurement of the quantiser",
    )
  }
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await page.evaluate<boolean>("!!window.__ready")) return
    if (Date.now() > deadline) throw new Error(`${url} never signalled __ready`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
