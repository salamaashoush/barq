/**
 * The calling convention, pinned where the oracle can see it.
 *
 * Three of M3's rules had no executable L1 channel at all: C1 (one calling
 * convention), C2 (a component is DECLARED, never inferred) and C3 (props are
 * Cells). The corpus-wide assertion in `compile.rs` covers C1's EMISSION, and
 * `packages/core/src/props.test.ts` covers C3's runtime — but neither is the L1
 * channel §14.1 asks for, and §14.1's own coverage line counted all three as
 * unobserved.
 *
 * Every claim below runs the COMPILED module and reads the answer off the DOM
 * or off a counter, so a compiler that emitted the right text and a runtime that
 * ignored it would still fail.
 *
 * C2 has two directions and the second one is the one that stayed broken: a
 * component whose body does not syntactically return JSX still gets called
 * `Comp($s, props)` by every tag site in the module, so it has to accept the
 * scope. `Label` below is exactly that shape, and before M3 it bound `props` to
 * the Scope and threw.
 *
 * SEMANTICS.md §3 C1, C2, C3.
 */
import { mergeProps, omit, render, splitProps } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"
import { formatThrown } from "../../test/semantics-support.ts"

export const rules = ["C1", "C2", "C3"]


let counted = 0

/** A Cell that reports every read. Forwarding one may not read it. */
function counting(): string {
  counted++
  return "carried"
}

/** C2's second direction: a component whose body returns no JSX at all. */
function Label(props: { text: () => string }) {
  return props.text()
}

/** C2's first direction: a `.map` callback keeps the arity `map` calls it with. */
function Rows(props: { items: () => number[] }) {
  return <ul class="rows">{props.items().map((row) => <li class="row">{row}</li>)}</ul>
}

interface Carried extends Record<string, unknown> {
  carrier: () => string
  keep: () => string
}

/** Three wrappers, each mangling the props record a different legal way. */
function Inner(props: Carried) {
  return (
    <b class="inner">
      {props.keep()}:{props.carrier === undefined ? "LOST" : "held"}
    </b>
  )
}

function Middle(props: Carried & { drop?: () => string }) {
  const rest = omit(props, "drop") as unknown as Carried
  return <Inner {...rest} />
}

function Outer(props: Carried) {
  const [taken, others] = splitProps(props, ["keep"])
  const merged = mergeProps(others, { keep: taken.keep }) as unknown as Carried
  return <Middle {...merged} drop={() => "dropped"} />
}

function Tree() {
  return (
    <div class="host">
      <Label text={() => "label"} />
      <Rows items={() => [1, 2]} />
      <Outer carrier={counting} keep={() => "kept"} />
    </div>
  )
}

/**
 * A Block, written as a declaration the module lets out. C2 says a component is
 * DECLARED, so an arrow in `render`'s argument list is exactly the shape the
 * compiler is not allowed to guess about.
 */
export const Subject = () => <Tree />

interface Run {
  html: string
  /**
   * The rendered TEXT, not the markup. `-O0` leaves an anchor comment between
   * two text runs that `-Ox` fuses, so a claim about content spelled against
   * `innerHTML` reaches a different verdict at the two levels — which the L3
   * differential correctly reports as the fixture's bug, not the compiler's.
   */
  text: string
  readsAtBuild: number
  thrown: string
}

async function mount(kit: Kit): Promise<Run> {
  counted = 0
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(Subject as never, host)
  })
  await kit.settle()
  return {
    html: host.innerHTML,
    text: host.textContent ?? "",
    readsAtBuild: counted,
    thrown: formatThrown(thrown),
  }
}

const BUILT = "nothing rendered at all, so no claim below observed anything"

export const claims: Claim[] = [
  {
    id: "a-component-that-returns-no-jsx-still-takes-the-scope",
    rule: "C2",
    says: "a component is declared, not inferred: any declaration this module writes as a tag is called with the scope, so it must accept one",
    async check(kit) {
      const run = await mount(kit)
      kit.precondition(run.text.length > 0 || run.html.length > 0, BUILT)
      if (!run.text.includes("label")) {
        kit.fail(
          `<Label text={…}/> rendered ${JSON.stringify(run.text)}, expected it to contain "label" ` +
            `(${run.thrown}). \`function Label(props) { return props.text() }\` contains no JSX, so ` +
            `the declaration half of C2 never gave it a scope parameter while every tag site passed ` +
            `one — which binds \`props\` to the Scope, in-module, with no diagnostic`,
        )
      }
    },
  },
  {
    id: "a-map-callback-keeps-the-arity-its-caller-uses",
    rule: "C2",
    says: "containing JSX is not evidence of a component: `Array.prototype.map` owns its callback's argument list",
    async check(kit) {
      const run = await mount(kit)
      kit.precondition(run.text.length > 0 || run.html.length > 0, BUILT)
      const rows = [...run.html.matchAll(/<li class="row">([\s\S]*?)<\/li>/g)].map((m) =>
        m[1].replace(/<!---->/g, ""),
      )
      if (rows.join(",") !== "1,2") {
        kit.fail(
          `rows.map((row) => <li>{row}</li>) rendered ${JSON.stringify(rows)}, expected the ` +
            `items 1 and 2 (${run.thrown}). A scope parameter prepended here shifts every argument ` +
            `\`map\` passes, and the row renders the Scope where its item belongs`,
        )
      }
    },
  },
  {
    id: "forwarding-through-three-wrappers-reads-nothing",
    rule: "C3",
    says: "a prop is a Cell and forwarding is a copy of the carrier, so spread, omit, splitProps and mergeProps evaluate nothing",
    async check(kit) {
      const run = await mount(kit)
      kit.precondition(run.text.length > 0 || run.html.length > 0, BUILT)
      if (run.readsAtBuild !== 0) {
        kit.fail(
          `a counting Cell forwarded through three compiled wrappers (spread, omit, splitProps, ` +
            `mergeProps) was read ${run.readsAtBuild} time(s) during construction, expected 0 ` +
            `(${run.thrown}). A getter-valued prop is read by every operation that copies own ` +
            `enumerable properties; a Cell is not`,
        )
      }
    },
  },
  {
    id: "the-carrier-survives-the-hops",
    rule: "C1",
    says: "one calling convention end to end: the innermost component still holds the caller's carrier after three forwarding hops",
    async check(kit) {
      const run = await mount(kit)
      kit.precondition(run.text.length > 0 || run.html.length > 0, BUILT)
      if (!run.text.includes("kept:held")) {
        kit.fail(
          `the innermost component rendered ${JSON.stringify(run.text)}, expected "kept:held" ` +
            `(${run.thrown}). Either a hop dropped the carrier or a hop invoked it`,
        )
      }
    },
  },
]
