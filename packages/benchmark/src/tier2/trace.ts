/**
 * The duration js-framework-benchmark actually reports, computed the way it
 * computes it: from a Chrome trace, as `commit.end - click.ts`.
 *
 * ## Why the obvious instrument is wrong, measured
 *
 * The first cut of this lane timed `performance.now()` from the click to the
 * end of the frame, using afterframe — which is what js-framework-benchmark's
 * own *secondary* afterframe lane does. Driven over eight consecutive `select
 * row` clicks it produced this, in a real Chrome, for both frameworks:
 *
 *   barq   1.1  6.0  15.8  16.4  16.6  16.4  16.6  16.5   ms
 *   solid  0.4  7.9  16.4  16.5  16.5  16.5  16.5  16.5   ms
 *
 * Once the page is producing frames the number converges on 16.5 ms — the
 * vsync interval — for both, and what it reports is where in the refresh cycle
 * the click happened to land. Under the 4x CPU throttling this benchmark
 * applies to its short rows the frame stretches and so does the artefact: one
 * run of that instrument reported barq 5.7 ms against Solid 84.1 ms on `select
 * row`, a 15x "win" that is entirely vsync phase. The script halves were 0.5 ms
 * and 0.5 ms.
 *
 * That is the Tier-1/Tier-2 lesson arriving from the other direction, and it is
 * the reason this file exists rather than a 40-line afterframe timer. Upstream
 * hit the same thing and handles it in two places: the duration is taken from
 * trace events rather than the wall clock, and a `requestAnimationFrame` that
 * waited more than 16 ms for its `FireAnimationFrame` has the wait subtracted.
 * Both are reproduced below.
 *
 * ## The definition, transcribed from `webdriver-ts/src/timeline.ts`
 *
 *  1. the start is the single `EventDispatch` whose `args.data.type` is
 *     `click`;
 *  2. keep the events after that click's end that are on the click's process;
 *  3. find the LAST of {click, FireAnimationFrame, TimerFire, Layout,
 *     FunctionCall} — that is where the framework's own work ends;
 *  4. the end is the first compositor `Commit` after it, or the last `Commit`
 *     if none is after it;
 *  5. duration = `commit.end - click.ts`, minus a long rAF wait.
 */
import type { Page } from "./cdp.ts"

export const TRACE_CATEGORIES: readonly string[] = [
  "blink.user_timing",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
]

interface RawEvent {
  name?: string
  ph?: string
  ts?: number
  dur?: number
  pid?: number
  args?: { data?: { type?: string } }
}

interface Timed {
  type: string
  ts: number
  dur: number
  end: number
  pid: number
}

const JS_EVENTS = new Set([
  "EventDispatch",
  "EvaluateScript",
  "v8.evaluateModule",
  "FunctionCall",
  "TimerFire",
  "FireIdleCallback",
  "FireAnimationFrame",
  "RunMicrotasks",
  "V8.Execute",
])

const PAINT_EVENTS = new Set([
  "UpdateLayoutTree",
  "Layout",
  "Commit",
  "Paint",
  "Layerize",
  "PrePaint",
])

function relevant(entries: readonly RawEvent[]): Timed[] {
  const kept: Timed[] = []
  for (const event of entries) {
    const ts = event.ts ?? 0
    const dur = event.dur ?? 0
    const pid = event.pid ?? 0
    const push = (type: string, span = dur) =>
      kept.push({ type, ts, dur: span, end: ts + span, pid })
    if (event.name === "EventDispatch") {
      const type = event.args?.data?.type
      if (type === "click") push("click")
      else if (type === "mousedown") push("mousedown")
      else if (type === "pointerup") push("pointerup")
    } else if (event.ph === "X" && event.name === "Layout") push("layout")
    else if (event.ph === "X" && event.name === "FunctionCall") push("functioncall")
    else if (event.ph === "X" && event.name === "Commit") push("commit")
    else if (event.ph === "X" && event.name === "Paint") push("paint")
    else if (event.ph === "X" && event.name === "FireAnimationFrame") push("fireAnimationFrame")
    else if (event.ph === "X" && event.name === "TimerFire") push("timerFire", 0)
    else if (event.name === "RequestAnimationFrame") push("requestAnimationFrame", 0)
  }
  return kept.sort((a, b) => a.end - b.end)
}

export interface CpuDuration {
  /** Milliseconds, click to compositor commit. */
  duration: number
  /** Main-thread script inside the measured window, milliseconds. */
  script: number
  /** Style, layout, paint and commit inside the measured window, milliseconds. */
  paint: number
  commits: number
  rafAdjustment: number
}

/** Sum of the durations of `names`, clipped to `[from, to]`, in milliseconds. */
function sumWithin(
  entries: readonly RawEvent[],
  names: ReadonlySet<string>,
  pid: number,
  from: number,
  to: number,
): number {
  // Nested events would double-count, so the intervals are merged before they
  // are summed. `RunMicrotasks` inside a `FunctionCall` is the case that makes
  // this mandatory rather than tidy, and it is exactly where a microtask-flush
  // runtime like this one would otherwise be charged twice for one flush.
  const spans: Array<[number, number]> = []
  for (const event of entries) {
    if (!event.name || !names.has(event.name) || event.ph !== "X") continue
    if ((event.pid ?? 0) !== pid) continue
    const start = Math.max(event.ts ?? 0, from)
    const end = Math.min((event.ts ?? 0) + (event.dur ?? 0), to)
    if (end > start) spans.push([start, end])
  }
  spans.sort((a, b) => a[0] - b[0])
  let total = 0
  let cursor = -Infinity
  for (const [start, end] of spans) {
    const begin = Math.max(start, cursor)
    if (end > begin) total += end - begin
    cursor = Math.max(cursor, end)
  }
  return total / 1000
}

export function computeCpuDuration(entries: readonly RawEvent[]): CpuDuration {
  const events = relevant(entries)
  const clicks = events.filter((e) => e.type === "click")
  if (clicks.length !== 1) {
    throw new Error(
      `exactly one click EventDispatch is expected in the traced window, saw ${clicks.length}. ` +
        "Tracing must start AFTER the warmup clicks and stop before any other click.",
    )
  }
  const click = clicks[0]
  const during = events.filter((e) => e.ts > click.end || e.type === "click")
  const onThread = during.filter((e) => e.pid === click.pid)

  const startFrom = onThread.filter((e) =>
    e.type === "click" ||
    e.type === "fireAnimationFrame" ||
    e.type === "timerFire" ||
    e.type === "layout" ||
    e.type === "functioncall"
  )
  const last = startFrom.at(-1)
  if (last === undefined) throw new Error("the traced window contains no main-thread events")

  const commits = onThread.filter((e) => e.type === "commit")
  if (commits.length === 0) throw new Error("the traced window contains no compositor Commit")
  const commit = commits.find((e) => e.ts > last.end) ?? commits.at(-1)!

  let duration = (commit.end - click.ts) / 1000

  // Upstream's rAF correction. A single requestAnimationFrame issued inside the
  // click, answered by a single FireAnimationFrame more than 16 ms later, was
  // waiting for vsync and not working — which is the artefact documented at the
  // top of this file, arriving through the trace instead of the wall clock.
  const rafsInClick = events.filter(
    (e) => e.type === "requestAnimationFrame" && e.ts >= click.ts && e.ts <= click.end,
  )
  const fafs = events.filter(
    (e) => e.type === "fireAnimationFrame" && e.ts >= click.ts && e.ts < commit.ts,
  )
  const layouts = onThread.filter((e) => e.type === "layout")
  let rafAdjustment = 0
  if (rafsInClick.length === 1 && fafs.length === 1) {
    const wait = (fafs[0].ts - click.end) / 1000
    const layoutBeforeRaf = layouts.some((e) => e.ts < fafs[0].ts)
    if (wait > 16 && !layoutBeforeRaf) {
      rafAdjustment = wait - 16
      duration -= rafAdjustment
    }
  }

  return {
    duration,
    script: sumWithin(entries, JS_EVENTS, click.pid, click.ts, commit.end),
    paint: sumWithin(entries, PAINT_EVENTS, click.pid, click.ts, commit.end),
    commits: commits.length,
    rafAdjustment,
  }
}

/**
 * Trace `body`, and return the trace events it produced.
 *
 * `Tracing` is a browser-level domain, so it goes through `sendRoot`; the
 * events arrive as a stream of `Tracing.dataCollected` and finish with a single
 * `Tracing.tracingComplete`, which is the only reliable signal that the buffer
 * has been drained.
 */
export async function traced<T>(
  page: Page,
  body: () => Promise<T>,
): Promise<{ value: T; events: RawEvent[] }> {
  const events: RawEvent[] = []
  const offData = page.on("Tracing.dataCollected", (params) => {
    const batch = params.value as RawEvent[] | undefined
    if (batch) for (const event of batch) events.push(event)
  })
  let complete = () => {}
  const done = new Promise<void>((resolve) => (complete = resolve))
  const offComplete = page.on("Tracing.tracingComplete", () => complete())

  await page.sendRoot("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: {
      enableSampling: false,
      enableSystrace: false,
      excludedCategories: [],
      includedCategories: TRACE_CATEGORIES,
    },
  })
  try {
    const value = await body()
    await page.sendRoot("Tracing.end", {})
    await Promise.race([
      done,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Chrome never reported Tracing.tracingComplete")), 30_000),
      ),
    ])
    return { value, events }
  } finally {
    offData()
    offComplete()
  }
}
