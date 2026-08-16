/**
 * A headless Chrome over CDP, for measurement.
 *
 * `packages/compiler-rs/test/chrome.ts` is the same idea for CORRECTNESS, and
 * this is deliberately not that file. A measurement driver needs three things a
 * correctness check must never silently inherit:
 *
 *  1. **launch flags that change how Chrome schedules work.** A benchmark has
 *     to turn off background-timer throttling and occlusion backgrounding, or
 *     rAF stops firing in a headless page and every duration becomes a
 *     measurement of the throttle. A conformance run that inherited those flags
 *     would be testing a browser nobody ships.
 *  2. **CDP EVENTS.** The correctness driver correlates responses by `id` and
 *     drops everything else, which is right for `Runtime.evaluate`. Tracing
 *     arrives as an unsolicited stream of `Tracing.dataCollected`, and there is
 *     no other way to read a trace out of Chrome.
 *  3. **browser-level sends.** `Tracing` lives on the browser target, not on a
 *     page session; sent with a session id it is refused.
 *
 * The parts that are genuinely the same — finding Chrome, the `node:http`
 * handshake, the port sweep — are the same because they are answers to the same
 * problems, and the reasons are recorded in that file.
 */
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import { request } from "node:http"

const CANDIDATES = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
]

/** Where Chrome is, or a loud failure. A benchmark that skips reports nothing. */
export function chromePath(explicit?: string): string {
  const candidate = explicit ?? process.env.CHROME_PATH
  if (candidate) {
    if (!existsSync(candidate)) throw new Error(`no Chrome at ${candidate}`)
    return candidate
  }
  const found = CANDIDATES.find((path) => existsSync(path))
  if (!found) {
    throw new Error(
      `no Chrome found; tried ${CANDIDATES.join(", ")}. Set CHROME_PATH. ` +
        "Tier 2 is a claim about a real browser and there is nothing to report without one.",
    )
  }
  return found
}

/**
 * Every flag here is a measurement decision.
 *
 * - the three throttling flags are what js-framework-benchmark's own runner
 *   passes. A headless page is never foregrounded, so without them `setTimeout`
 *   is clamped and `requestAnimationFrame` stops firing.
 * - `--js-flags=--expose-gc` gives `globalThis.gc`, which the reactivity benches
 *   call between trials. Without it they still run — with GC pauses landing
 *   inside timed regions instead of between them.
 * - `--enable-precise-memory-info` makes `performance.memory` report bytes
 *   rather than a 100 KB-quantised value, which is the difference between a
 *   memory row that can see a per-row allocation and one that cannot.
 * - a real window size, because layout cost depends on how much of the table is
 *   in the viewport and a 0x0 window would make "create 1,000 rows" free.
 */
export const BENCH_FLAGS: readonly string[] = [
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--disable-features=CalculateNativeWinOcclusion",
  "--disable-background-networking",
  "--disable-extensions",
  "--disable-default-apps",
  "--disable-sync",
  "--disable-translate",
  "--js-flags=--expose-gc",
  "--enable-precise-memory-info",
  "--window-size=1280,1024",
  "--force-device-scale-factor=1",
  "--hide-scrollbars",
  "--mute-audio",
  "--no-first-run",
  "--no-default-browser-check",
]

export interface Page {
  evaluate<T>(expression: string): Promise<T>
  /** A raw CDP call against the attached page session. */
  send(method: string, params: unknown): Promise<Record<string, unknown> | undefined>
  /** A raw CDP call against the browser, with no session. */
  sendRoot(method: string, params: unknown): Promise<Record<string, unknown> | undefined>
  /** Subscribe to a CDP event. Returns the unsubscribe. */
  on(method: string, handler: (params: Record<string, unknown>) => void): () => void
  navigate(url: string): Promise<void>
  throttle(rate: number): Promise<void>
  /**
   * Evaluate, and refuse the `{ __benchError }` an in-page guard returns. A
   * benchmark's worst failure mode is a body that threw inside a callback and
   * reported a very fast `undefined`.
   */
  call<T>(expression: string): Promise<T>
}

interface Connection {
  send(
    method: string,
    params: unknown,
    sessionId?: string,
  ): Promise<{ result?: Record<string, unknown>; error?: { message: string } }>
  on(method: string, handler: (params: Record<string, unknown>) => void): () => void
  close(): void
}

function get(port: number, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      let body = ""
      res.setEncoding("utf8")
      res.on("data", (chunk: string) => (body += chunk))
      res.on("end", () => resolve(body))
    })
    req.on("error", reject)
    req.end()
  })
}

async function connect(port: number): Promise<Connection> {
  let wsUrl: string | undefined
  for (let attempt = 0; attempt < 200 && !wsUrl; attempt++) {
    try {
      const body = await get(port, "/json/version")
      wsUrl = (JSON.parse(body) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    if (!wsUrl) await new Promise((resolve) => setTimeout(resolve, Math.min(250, 50 + attempt * 10)))
  }
  if (!wsUrl) throw new Error("Chrome did not expose a debugging endpoint")

  const socket = new WebSocket(wsUrl)
  await Promise.race([
    new Promise((resolve) => (socket.onopen = resolve)),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Chrome accepted no CDP socket within 15s")), 15_000),
    ),
  ])

  let id = 0
  const pending = new Map<number, (value: Record<string, unknown>) => void>()
  const listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>()
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number
      method?: string
      params?: Record<string, unknown>
    }
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)?.(message as Record<string, unknown>)
      pending.delete(message.id)
      return
    }
    if (message.method) {
      for (const handler of listeners.get(message.method) ?? []) handler(message.params ?? {})
    }
  }

  return {
    send(method, params, sessionId) {
      const mid = ++id
      return new Promise((resolve) => {
        pending.set(mid, resolve as never)
        socket.send(JSON.stringify({ id: mid, sessionId, method, params }))
      })
    },
    on(method, handler) {
      let set = listeners.get(method)
      if (!set) listeners.set(method, (set = new Set()))
      set.add(handler)
      return () => {
        set.delete(handler)
      }
    },
    close: () => socket.close(),
  }
}

export async function withBenchChrome<T>(body: (page: Page) => Promise<T>): Promise<T> {
  const binary = chromePath()
  const base = `/tmp/barq-bench-chrome-${process.pid}-${Date.now()}`
  const firstPort = 9700 + (process.pid % 250)
  const profiles: string[] = []
  let chrome: ChildProcess | undefined
  let connection: Connection | undefined

  try {
    for (let offset = 0; connection === undefined; offset++) {
      const port = 9700 + ((firstPort - 9700 + offset) % 250)
      const profile = offset === 0 ? base : `${base}-${offset}`
      profiles.push(profile)
      const candidate = spawn(
        binary,
        [
          "--headless=new",
          `--remote-debugging-port=${port}`,
          "--no-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          `--user-data-dir=${profile}`,
          ...BENCH_FLAGS,
          "about:blank",
        ],
        { stdio: "ignore" },
      )
      try {
        connection = await connect(port)
        chrome = candidate
      } catch (error) {
        candidate.kill()
        if (offset === 4) throw error
      }
    }

    const target = await connection.send("Target.createTarget", { url: "about:blank" })
    const targetId = (target.result as { targetId: string }).targetId
    const attached = await connection.send("Target.attachToTarget", { targetId, flatten: true })
    const sessionId = (attached.result as { sessionId: string }).sessionId

    const page: Page = {
      async send(method, params) {
        const response = await connection!.send(method, params, sessionId)
        if (response.error) throw new Error(`${method}: ${response.error.message}`)
        return response.result
      },
      async sendRoot(method, params) {
        const response = await connection!.send(method, params)
        if (response.error) throw new Error(`${method}: ${response.error.message}`)
        return response.result
      },
      on(method, handler) {
        return connection!.on(method, handler)
      },
      async evaluate<R>(expression: string) {
        const evaluated = await connection!.send(
          "Runtime.evaluate",
          { expression, returnByValue: true, awaitPromise: true },
          sessionId,
        )
        const payload = evaluated.result as {
          result?: { value?: unknown }
          exceptionDetails?: unknown
        }
        if (payload?.exceptionDetails) throw new Error(JSON.stringify(payload.exceptionDetails))
        return payload?.result?.value as R
      },
      async call<R>(expression: string) {
        const value = await page.evaluate<R | { __benchError: string }>(expression)
        if (value && typeof value === "object" && "__benchError" in value) {
          throw new Error(`in-page failure: ${(value as { __benchError: string }).__benchError}`)
        }
        return value as R
      },
      /**
       * `Page.navigate` on the ONE attached target, never a second
       * `Target.createTarget`. A run loads a page per framework per benchmark;
       * opening a target each time leaves the previous one alive, and a
       * detached-but-running renderer competes for the same cores as the one
       * being timed. That is a whole-run bias, not a row's noise.
       */
      async navigate(url) {
        await page.send("Page.navigate", { url })
        const wanted = new URL(url).pathname
        for (let attempt = 0; attempt < 1500; attempt++) {
          const state = await page.evaluate<string>(
            "document.readyState + '|' + location.pathname",
          )
          if (state === `complete|${wanted}`) return
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        throw new Error(`${url} never reached readyState complete`)
      },
      async throttle(rate) {
        await page.send("Emulation.setCPUThrottlingRate", { rate })
      },
    }

    await page.send("Page.enable", {})
    return await body(page)
  } finally {
    connection?.close()
    chrome?.kill()
    for (const profile of profiles) rmSync(profile, { recursive: true, force: true })
  }
}
