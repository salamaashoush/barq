/**
 * `CODESIGN.md` §0.2 and §0.3, re-run against a real DOM.
 *
 * ## This file IS §0.3's measurement, as of M7c
 *
 * §0.3 cites this path, and carries a table of this file's own numbers beside
 * the original one it quoted from a scratch file that no longer exists. A
 * change to the calling convention re-runs
 *
 *     cd packages/benchmark && bun run bench:tier2:shapes
 *
 * and edits the section from the output, rather than re-quoting a number nobody
 * can reproduce. Raw results land in `packages/benchmark/tier2-results.json`.
 *
 * ## Why this file had to be written from the document rather than moved
 *
 * The A/B/C/D/D2/E table in §0.3 is the measurement the chosen calling
 * convention rests on, and it is not in the repository. It was taken in a
 * scratch file that no longer exists, so the number defending the convention
 * cannot be reproduced from what is checked in — which is a finding about the
 * project's evidence, independent of what the re-run says. What follows is a
 * RECONSTRUCTION from §0.3's own descriptions of the six shapes. It is stated
 * as one, and the shapes are written out so a reader can disagree with the
 * reconstruction rather than with a number.
 *
 * The six, in §0.3's words:
 *
 *   A  current: eager children, value props            (the baseline it omits)
 *   B  thunk props + block children, return-DOM
 *   C  thunk props + block children, (parent, anchor)
 *   D  + explicit scope argument (ownership-passing)   ← the chosen convention
 *   D2 + explicit scope arg, one Scope allocated PER ROW
 *   E  compiler-inlined, no component frame at all
 *
 * Every shape produces BYTE-IDENTICAL DOM, and the page asserts that before it
 * times anything. A convention comparison in which one arm builds a different
 * tree is not a convention comparison.
 *
 * ## What is measured, and why it is two numbers
 *
 * §0.3's conclusion has two halves that pull apart — "23.7% of JS overhead"
 * against "0% through a DOM" — so both are reported: `js` is the mount loop,
 * `total` is the mount loop plus a forced layout. On a stub DOM those are the
 * same number, which is exactly how a stub DOM produced a conclusion about a
 * real one.
 */
import {
  block,
  cell,
  createScope,
  enter,
  exit,
  flush,
  insert,
  mapArray,
  props,
  setProp,
  signal,
  template,
  type Scope,
} from "@barqjs/core"

const HTML =
  '<div class="card"><h2> </h2><p class="body"> </p><span class="tail">tail</span></div>'
const tmpl = template(HTML)

interface Row {
  id: number
  label: string
  tone: string
}

function rows(n: number): Row[] {
  const out = new Array<Row>(n)
  for (let i = 0; i < n; i++) out[i] = { id: i, label: `row ${i}`, tone: i % 2 ? "odd" : "even" }
  return out
}

function host(): HTMLElement {
  const el = document.createElement("div")
  document.body.appendChild(el)
  return el
}

/**
 * The one place the row's DOM is described. Every shape ends up calling this.
 *
 * `setProp` and `insert` take the owning scope FIRST — that is the calling
 * convention this file is about, and passing `null` is the legal "no owner
 * here" case rather than an omission.
 */
function fill(node: Element, label: string, tone: string, tail: unknown): void {
  const heading = node.firstChild as Element
  const body = heading.nextSibling as Element
  heading.textContent = label
  setProp(null, body, "class", `body ${tone}`)
  if (tail !== undefined) insert(null, node, tail as never, null)
}

// ---------------------------------------------------------------- A
// Eager children, value props. `children` is a prop like any other and it is
// already built by the time the component is entered, which is the defect
// §3.1's convention exists to make unrepresentable.

function RowA(p: { label: string; tone: string; children?: unknown }): Element {
  const node = tmpl() as Element
  fill(node, p.label, p.tone, p.children)
  return node
}

function mountA(parent: HTMLElement, data: readonly Row[]): void {
  for (const row of data) {
    parent.appendChild(RowA({ label: row.label, tone: row.tone }))
  }
}

// ---------------------------------------------------------------- B
// Thunk props and a Block for children; the component returns its DOM and the
// caller appends it.

function RowB(p: Record<string, unknown>, children: (() => unknown) | null): Element {
  const node = tmpl() as Element
  fill(node, (p.label as () => string)(), (p.tone as () => string)(), children?.())
  return node
}

function mountB(parent: HTMLElement, data: readonly Row[]): void {
  for (const row of data) {
    parent.appendChild(
      RowB(props([{ label: cell(row.label), tone: cell(row.tone) }]) as Record<string, unknown>, null),
    )
  }
}

// ---------------------------------------------------------------- C
// The same, but the component is handed where to put its output instead of
// handing it back.

function RowC(
  p: Record<string, unknown>,
  children: (() => unknown) | null,
  parent: Node,
  anchor: Node | null,
): void {
  const node = tmpl() as Element
  fill(node, (p.label as () => string)(), (p.tone as () => string)(), children?.())
  parent.insertBefore(node, anchor)
}

function mountC(parent: HTMLElement, data: readonly Row[]): void {
  for (const row of data) {
    RowC(
      props([{ label: cell(row.label), tone: cell(row.tone) }]) as Record<string, unknown>,
      null,
      parent,
      null,
    )
  }
}

// ---------------------------------------------------------------- D
// The chosen convention: the scope comes first and `block` makes it the ambient
// owner for the whole body, so `useContext`, `onCleanup` and `effect` inside
// the component are decided by the argument rather than by whatever was
// current at the call site.

const RowD = block(function RowD(
  _scope: Scope | null,
  p: Record<string, unknown>,
  children: (() => unknown) | null,
  parent: Node,
  anchor: Node | null,
): void {
  const node = tmpl() as Element
  fill(node, (p.label as () => string)(), (p.tone as () => string)(), children?.())
  parent.insertBefore(node, anchor)
})

/**
 * The scope is REAL, and that is the whole point of the arm.
 *
 * The first cut called this with `null`, which `block`'s guard treats as the
 * legal "no owner here" case: it returns before the owner/host save-and-restore
 * and the ownership-passing never happens. The arm labelled "the chosen
 * convention" was measuring convention C with an extra argument. Measured
 * directly, the skipped half is 0.5 ns a call — 4.5% of the gap C1 adjudicates,
 * which is not nothing at this resolution.
 */
function mountD(parent: HTMLElement, data: readonly Row[], scope: Scope): void {
  for (const row of data) {
    RowD(
      scope,
      props([{ label: cell(row.label), tone: cell(row.tone) }]) as Record<string, unknown>,
      null,
      parent,
      null,
    )
  }
}

// ---------------------------------------------------------------- D2
// D with a real `Scope` allocated per position. §0.3 priced this at 7.3 ns a
// row on a stub DOM and concluded it was "worth a NO_SCOPE flag, not worth a
// design"; the flag exists, so this row is what the flag is worth.

function mountD2(parent: HTMLElement, data: readonly Row[], scope: Scope): void {
  for (const row of data) {
    // PARENTED, so the row scope pays the parent-link push a real per-position
    // Scope pays. `enter(null)` allocated an orphan and skipped it.
    const instance = enter(scope)
    try {
      RowD(
        instance,
        props([{ label: cell(row.label), tone: cell(row.tone) }]) as Record<string, unknown>,
        null,
        parent,
        null,
      )
    } finally {
      exit(instance)
    }
  }
}

// ---------------------------------------------------------------- E
// No component frame at all — the shape Anvil's headline optimisation would
// produce. §0.3 measured it at 15% of JS overhead on a stub DOM and 0% through
// happy-dom, and sent it to the backlog on the strength of the second number.

function mountE(parent: HTMLElement, data: readonly Row[]): void {
  for (const row of data) {
    const node = tmpl() as Element
    const heading = node.firstChild as Element
    const body = heading.nextSibling as Element
    heading.textContent = row.label
    setProp(null, body, "class", `body ${row.tone}`)
    parent.insertBefore(node, null)
  }
}

// ---------------------------------------------------------------- stub DOM
// §0.3's own instrument, moved inside V8.
//
// The browser arms above time `mount` INCLUDING the DOM mutation, and at 200
// rows that is ~98% of the number: 2000 ns a row against the 46.6 ns a row
// §0.3's stub reported. A 23.7% difference in the JS half is therefore ~0.5% of
// the browser `js` column, which no amount of trials resolves — so the browser
// arms can bound the TOTAL cost and cannot adjudicate the ratio §0.3 stated.
//
// These arms can. They keep every part of the convention real — `props`, `cell`,
// `block`'s owner save-and-restore, `enter`/`exit`, the component frames — and
// replace only the node with a plain object, which is exactly the substitution
// §0.3 made. What comes out is the same quantity §0.3's 9.328/11.537 µs are,
// measured by V8 instead of by Bun over happy-dom's stubs.

interface StubNode {
  kids: StubNode[]
  attrs: Record<string, string>
  text: string
}

function stubTemplate(): StubNode {
  return {
    kids: [
      { kids: [], attrs: {}, text: " " },
      { kids: [], attrs: { class: "body" }, text: " " },
      { kids: [], attrs: { class: "tail" }, text: "tail" },
    ],
    attrs: { class: "card" },
    text: "",
  }
}

function stubFill(node: StubNode, label: string, tone: string, tail: unknown): void {
  node.kids[0].text = label
  node.kids[1].attrs.class = `body ${tone}`
  if (tail !== undefined) node.kids.push(tail as StubNode)
}

function stubA(parent: StubNode, data: readonly Row[]): void {
  for (const row of data) {
    const p = { label: row.label, tone: row.tone }
    const node = stubTemplate()
    stubFill(node, p.label, p.tone, undefined)
    parent.kids.push(node)
  }
}

function StubRowC(
  p: Record<string, unknown>,
  children: (() => unknown) | null,
  parent: StubNode,
): void {
  const node = stubTemplate()
  stubFill(node, (p.label as () => string)(), (p.tone as () => string)(), children?.())
  parent.kids.push(node)
}

const StubRowD = block(function StubRowD(
  _scope: Scope | null,
  p: Record<string, unknown>,
  children: (() => unknown) | null,
  parent: StubNode,
): void {
  const node = stubTemplate()
  stubFill(node, (p.label as () => string)(), (p.tone as () => string)(), children?.())
  parent.kids.push(node)
})

function stubC(parent: StubNode, data: readonly Row[]): void {
  for (const row of data) {
    StubRowC(
      props([{ label: cell(row.label), tone: cell(row.tone) }]) as Record<string, unknown>,
      null,
      parent,
    )
  }
}

function stubD(parent: StubNode, data: readonly Row[], scope: Scope): void {
  for (const row of data) {
    StubRowD(
      scope,
      props([{ label: cell(row.label), tone: cell(row.tone) }]) as Record<string, unknown>,
      null,
      parent,
    )
  }
}

function stubD2(parent: StubNode, data: readonly Row[], scope: Scope): void {
  for (const row of data) {
    const instance = enter(scope)
    try {
      StubRowD(
        instance,
        props([{ label: cell(row.label), tone: cell(row.tone) }]) as Record<string, unknown>,
        null,
        parent,
      )
    } finally {
      exit(instance)
    }
  }
}

function stubE(parent: StubNode, data: readonly Row[]): void {
  for (const row of data) {
    const node = stubTemplate()
    node.kids[0].text = row.label
    node.kids[1].attrs.class = `body ${row.tone}`
    parent.kids.push(node)
  }
}

// §0.2's three carriers on the same instrument. The 8.7x is a stub-DOM number
// (81.283 vs 9.328 µs) and the browser arms cannot report in that unit either,
// for exactly the reason the A/D pair cannot.

function stubValue(parent: StubNode, data: readonly Row[]): void {
  for (const row of data) {
    const p = { label: row.label, tone: row.tone }
    const node = stubTemplate()
    stubFill(node, p.label, p.tone, undefined)
    parent.kids.push(node)
  }
}

function stubGetter(parent: StubNode, data: readonly Row[]): void {
  for (const row of data) {
    const p = {
      get label() {
        return row.label
      },
      get tone() {
        return row.tone
      },
    }
    const node = stubTemplate()
    stubFill(node, p.label, p.tone, undefined)
    parent.kids.push(node)
  }
}

function stubThunk(parent: StubNode, data: readonly Row[]): void {
  for (const row of data) {
    const p = props([{ label: cell(row.label), tone: cell(row.tone) }]) as Record<string, unknown>
    const node = stubTemplate()
    stubFill(node, (p.label as () => string)(), (p.tone as () => string)(), undefined)
    parent.kids.push(node)
  }
}

type StubMount = (parent: StubNode, data: readonly Row[], scope: Scope) => void

const STUB_MOUNTS: Record<string, StubMount> = {
  A: stubA,
  C: stubC,
  D: stubD,
  D2: stubD2,
  E: stubE,
  VALUE: stubValue,
  GETTER: stubGetter,
  THUNK: stubThunk,
}

// ---------------------------------------------------------------- carriers
// §0.2's three props carriers, at the scale a props object is allocated: once
// per component instance, i.e. once per list row. The GETTER row is the shape
// Solid emits and the one this design rejected at 8.7x.

function mountValue(parent: HTMLElement, data: readonly Row[]): void {
  for (const row of data) {
    const p = { label: row.label, tone: row.tone }
    const node = tmpl() as Element
    fill(node, p.label, p.tone, undefined)
    parent.appendChild(node)
  }
}

function mountGetter(parent: HTMLElement, data: readonly Row[]): void {
  for (const row of data) {
    const p = {
      get label() {
        return row.label
      },
      get tone() {
        return row.tone
      },
    }
    const node = tmpl() as Element
    fill(node, p.label, p.tone, undefined)
    parent.appendChild(node)
  }
}

function mountThunk(parent: HTMLElement, data: readonly Row[]): void {
  for (const row of data) {
    const p = props([{ label: cell(row.label), tone: cell(row.tone) }]) as Record<string, unknown>
    const node = tmpl() as Element
    fill(node, (p.label as () => string)(), (p.tone as () => string)(), undefined)
    parent.appendChild(node)
  }
}

// ---------------------------------------------------------------- §0.4
// `setProp`'s dispatch against the direct DOM call it resolves to. §0.4 found
// 0–8% on happy-dom and struck the "10–25% per write" claim all three designs
// made. The channels are the ones that section names.

function channelCases(n: number): Record<string, () => void> {
  const el = document.createElement("div")
  const input = document.createElement("input")
  document.body.append(el, input)
  let tick = 0
  // The class case alternates between TWO tokens instead of writing a fresh one
  // each time, and that is not a stylistic choice.
  //
  // `setClass` takes a token-diff path whenever the attribute is not what it
  // last wrote, and a ONE-SHOT `setProp` always passes `prev: undefined`, so it
  // can never recognise its own previous write. Writing `c0, c1, c2, …` through
  // it therefore ADDS a token every call and removes none: after 20,000 writes
  // the element carries 20,000 classes and `classList.add` is walking all of
  // them. The first version of this file did exactly that and the run stopped
  // dead here — which is worth recording twice over, because §0.4's own
  // `setProp(el,'class',v)` number was taken the same way on happy-dom and is
  // a measurement of that accumulation rather than of the dispatcher.
  const classes = ["alpha", "beta"]
  // THE COMPARAND MATTERS, and two of the three rows had the wrong one.
  //
  // `setProp id` resolves to `element.setAttribute`, so `setAttribute id` is
  // like-for-like and the ratio between them is dispatcher and nothing else.
  // The other two are not: `setProp value` goes through `writeLive`, which
  // coerces, reads the live value, captures the caret and restores it — four
  // extra DOM crossings and a user-visible feature — while `input.value =` does
  // none of that; and `setProp class` diffs the tokens it OWNS while
  // `el.className =` takes the whole attribute. Reporting either ratio as
  // "the dispatcher" overstates it by about 2x, so the equivalent-work baselines
  // are here beside the bare ones and the dispatcher is read off the pairs.
  return {
    "setProp id": () => {
      for (let i = 0; i < n; i++) setProp(null, el, "id", `x${tick++}`)
    },
    "setAttribute id": () => {
      for (let i = 0; i < n; i++) el.setAttribute("id", `x${tick++}`)
    },
    "setProp value": () => {
      for (let i = 0; i < n; i++) setProp(null, input, "value", `v${tick++}`)
    },
    "input.value =": () => {
      for (let i = 0; i < n; i++) input.value = `v${tick++}`
    },
    "input.value = +caret": () => {
      for (let i = 0; i < n; i++) {
        const next = `v${tick++}`
        if (input.value !== next) {
          const start = input.selectionStart
          const end = input.selectionEnd
          input.value = next
          if (start !== null && end !== null) input.setSelectionRange(start, end)
        }
      }
    },
    "setProp class": () => {
      for (let i = 0; i < n; i++) setProp(null, el, "class", classes[tick++ & 1])
    },
    "el.className =": () => {
      for (let i = 0; i < n; i++) el.className = classes[tick++ & 1]
    },
    // What `setClass` does on its fast path since the one-shot accumulation fix:
    // read the attribute, check it is still what this channel last wrote, and
    // only then take the whole attribute. That is the comparand for `setProp
    // class`; `classList diff` below is the comparand for the path it falls to
    // when something else has touched the attribute.
    "className= +own": () => {
      let owned: string | null = null
      for (let i = 0; i < n; i++) {
        const next = classes[tick++ & 1]
        if (next !== owned) {
          if (el.getAttribute("class") === owned) el.className = next
          owned = next
        }
      }
    },
    // THE ONE-SHOT WRITE F3 MADE MEASURABLE. Every write is a token this
    // element has never carried, which is what a real `class={…}` binding over
    // a changing value does and what the two-token case above deliberately is
    // not. Before F3's fix this case could not be run at all: the channel added
    // each new token without removing the last, so the element accumulated
    // 20,000 classes and the run stopped dead. It is here as the honest price of
    // a one-shot class write AND as the regression guard — a return of the
    // accumulation shows up as this row going quadratic while the two-token row
    // beside it does not move.
    "setProp class fresh": () => {
      for (let i = 0; i < n; i++) setProp(null, el, "class", `c${tick++}`)
    },
    "el.className = fresh": () => {
      for (let i = 0; i < n; i++) el.className = `c${tick++}`
    },
    "classList diff": () => {
      for (let i = 0; i < n; i++) {
        const next = classes[tick++ & 1]
        const current = el.getAttribute("class")
        if (current !== next) {
          for (const token of (current ?? "").split(" ")) {
            if (token !== "" && token !== next) el.classList.remove(token)
          }
          el.classList.add(next)
        }
      }
    },
  }
}

// ---------------------------------------------------------------- K1
// The keying default's cost, which `SEMANTICS.md` K1 states and no lane
// measured. `mapArray` is the mapping half on its own — a stub mapper, so what
// is timed is the diff and the row bookkeeping and nothing else — under all
// three modes, against the two updates that tell them apart: a REORDER of the
// same objects, and an immutable REPLACEMENT that rebuilds every row under the
// default and none under either other mode.

interface KeyRow {
  id: number
  label: string
}

function keyRows(n: number): KeyRow[] {
  const out = new Array<KeyRow>(n)
  for (let i = 0; i < n; i++) out[i] = { id: i, label: `row ${i}` }
  return out
}

interface KeyingArm {
  builtOnReplace: number
  builtOnReorder: number
  replaceMs: number
  reorderMs: number
}

function keyingArm(mode: "default" | "byFn" | "false", n: number): KeyingArm {
  const source = signal(keyRows(n))
  let built = 0
  const out: KeyingArm = { builtOnReplace: 0, builtOnReorder: 0, replaceMs: 0, reorderMs: 0 }
  const dispose = createScope((d: () => void) => {
    const make = (): unknown => {
      built++
      return {}
    }
    const list =
      mode === "default"
        ? mapArray(() => source(), make)
        : mode === "byFn"
          ? mapArray(() => source(), make, { keyed: (item: KeyRow) => item.id })
          : mapArray(() => source(), make, { keyed: false })
    list()
    built = 0

    // Same objects, new order: every mode should move rows rather than build.
    const reordered = source.peek().slice().reverse()
    let start = performance.now()
    source.set(reordered)
    flush()
    list()
    out.reorderMs = performance.now() - start
    out.builtOnReorder = built
    built = 0

    // Fresh objects, same ids and same positions: the default keys by IDENTITY,
    // so every row is a new key and every row is rebuilt.
    const replaced = source.peek().map((row) => ({ id: row.id, label: row.label }))
    start = performance.now()
    source.set(replaced)
    flush()
    list()
    out.replaceMs = performance.now() - start
    out.builtOnReplace = built
    return d
  })
  dispose()
  return out
}

// ---------------------------------------------------------------- driver

type Mount = (parent: HTMLElement, data: readonly Row[], scope: Scope) => void

const MOUNTS: Record<string, Mount> = {
  A: mountA,
  B: mountB,
  C: mountC,
  D: mountD,
  D2: mountD2,
  E: mountE,
  VALUE: mountValue,
  GETTER: mountGetter,
  THUNK: mountThunk,
}

/**
 * Identical output is a precondition, not a hope. E and the three carrier
 * shapes take no children, so they are compared against A run with none.
 */
function agree(): string | null {
  const reference = (() => {
    const parent = host()
    const scope = rootScope()
    mountA(parent, rows(3), scope)
    const html = parent.innerHTML
    parent.remove()
    scope.dispose()
    return html
  })()
  for (const [name, mount] of Object.entries(MOUNTS)) {
    const parent = host()
    const scope = rootScope()
    mount(parent, rows(3), scope)
    const html = parent.innerHTML
    parent.remove()
    scope.dispose()
    if (html !== reference) {
      return `shape ${name} builds different DOM:\n  ${html}\n  ${reference}`
    }
  }
  return null
}

/**
 * A live, detached owner — what a component's caller actually has, and what
 * the D arms have to be handed for the convention to happen at all. Opened and
 * closed immediately so it is an ARGUMENT rather than the ambient owner: that
 * is the whole distinction the D shapes exist to price.
 */
function rootScope(): Scope {
  const scope = enter(null)
  exit(scope)
  return scope
}

interface Timing {
  js: number
  total: number
}

/**
 * One timed mount.
 *
 * The order matters and the first cut got it wrong: it removed the container
 * inside the timed closure and THEN read `offsetHeight`, so the forced layout
 * was a layout of an empty document and `total` came back equal to `js` for
 * every shape. That is a stub-DOM measurement taken inside a browser, which is
 * the exact failure this whole lane exists to stop. The rows are laid out while
 * they are still attached, and the container comes out afterwards.
 *
 * The owner is allocated BEFORE the clock starts and disposed after it stops,
 * for every shape alike: real emitted code is handed a scope that already
 * exists, so the one allocation is not part of the per-row work, and D2's
 * teardown of a thousand row scopes is not either. What is inside the window is
 * exactly what the convention costs per row.
 */
function once(mount: Mount, data: readonly Row[]): Timing {
  const parent = host()
  const scope = rootScope()
  const start = performance.now()
  mount(parent, data, scope)
  const mid = performance.now()
  void document.body.offsetHeight
  const end = performance.now()
  parent.remove()
  scope.dispose()
  return { js: mid - start, total: end - start }
}

const globalScope = globalThis as Record<string, unknown>

let DATA: Row[] = []

globalScope.__shapesPrepare = (rowCount: number) => {
  try {
    const mismatch = agree()
    if (mismatch) return { __benchError: mismatch }
    DATA = rows(rowCount)
    for (const mount of Object.values(MOUNTS)) {
      // Warm each shape and let its hidden classes settle before it is timed.
      for (let i = 0; i < 3; i++) once(mount, DATA)
    }
    return { ok: Object.keys(MOUNTS) }
  } catch (error) {
    return { __benchError: `shapes prepare: ${(error as Error)?.message ?? error}` }
  }
}

/**
 * ONE trial over every shape, and the driver loops.
 *
 * A trial times all nine so that machine drift lands on all of them together,
 * and the starting shape rotates so no shape always runs first — the same
 * interleaving `stats.ts` argues for and for the same reason. Reporting a
 * min-of-N per shape taken in a fixed order, which is what §0.2 and §0.3 did,
 * cannot tell a 4% convention difference from a 4% thermal ramp.
 */
globalScope.__shapesTrial = (trial: number) => {
  try {
    const names = Object.keys(MOUNTS)
    const order = names.slice(trial % names.length).concat(names.slice(0, trial % names.length))
    const out: Record<string, Timing> = {}
    for (const name of order) out[name] = once(MOUNTS[name], DATA)
    return { trial, timings: out }
  } catch (error) {
    return { __benchError: `shapes trial: ${(error as Error)?.message ?? error}` }
  }
}

let CHANNELS: Record<string, () => void> | null = null

globalScope.__channelNames = (writes: number) => {
  CHANNELS = channelCases(writes)
  return Object.keys(CHANNELS)
}

/**
 * ONE case per call, and the driver loops.
 *
 * The first cut ran all six inside a single `Runtime.evaluate`, and a CDP
 * evaluate is synchronous end to end: the session is blocked, nothing reports
 * progress, and a run that is merely slow is indistinguishable from one that
 * has hung. `setProp(input, "value", …)` is the case that made the difference
 * matter — it goes through `writeLive`, which captures and restores the caret,
 * and at six figures of writes that is minutes rather than seconds.
 */
globalScope.__channel = (name: string, writes: number, trials: number) => {
  try {
    if (CHANNELS === null) CHANNELS = channelCases(writes)
    const run = CHANNELS[name]
    if (!run) throw new Error(`no channel case named ${name}`)
    for (let i = 0; i < 3; i++) run()
    let best = Infinity
    for (let trial = 0; trial < trials; trial++) {
      const start = performance.now()
      run()
      const elapsed = performance.now() - start
      if (elapsed < best) best = elapsed
    }
    // Nanoseconds per write, which is the unit §0.4 reports.
    return { name, nsPerWrite: (best * 1e6) / writes }
  } catch (error) {
    return { __benchError: `channel ${name}: ${(error as Error)?.message ?? error}` }
  }
}

/**
 * K1's cost, which the rule states in words and no lane had a number for.
 * Best of `trials` per arm, the arms rotated so none of them always runs first.
 */
/**
 * The same contrast as `__shapesTrial`, with the DOM taken out — §0.3's own
 * instrument, in V8. Interleaved and rotated for the same reason.
 */
const stubTrial = (trial: number): { trial: number; timings: Record<string, number> } | { __benchError: string } => {
  try {
    const names = Object.keys(STUB_MOUNTS)
    const order = names.slice(trial % names.length).concat(names.slice(0, trial % names.length))
    const out: Record<string, number> = {}
    for (const name of order) {
      const parent: StubNode = { kids: [], attrs: {}, text: "" }
      const scope = rootScope()
      const start = performance.now()
      STUB_MOUNTS[name](parent, DATA, scope)
      out[name] = performance.now() - start
      scope.dispose()
    }
    return { trial, timings: out }
  } catch (error) {
    return { __benchError: `stub trial: ${(error as Error)?.message ?? error}` }
  }
}

globalScope.__stubTrial = stubTrial

globalScope.__stubPrepare = () => {
  try {
    for (let i = 0; i < 5; i++) stubTrial(i)
    return { ok: Object.keys(STUB_MOUNTS) }
  } catch (error) {
    return { __benchError: `stub prepare: ${(error as Error)?.message ?? error}` }
  }
}

globalScope.__keying = (rowCount: number, trials: number) => {
  try {
    const modes = ["default", "byFn", "false"] as const
    const out: Record<string, KeyingArm> = {}
    for (const mode of modes) keyingArm(mode, rowCount)
    for (const mode of modes) {
      let best: KeyingArm | null = null
      for (let trial = 0; trial < trials; trial++) {
        const one = keyingArm(mode, rowCount)
        if (best === null || one.replaceMs < best.replaceMs) best = one
      }
      out[mode] = best as KeyingArm
    }
    return { rows: rowCount, arms: out }
  } catch (error) {
    return { __benchError: `keying: ${(error as Error)?.message ?? error}` }
  }
}

globalScope.__ready = true
