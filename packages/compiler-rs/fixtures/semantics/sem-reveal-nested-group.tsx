/**
 * A6 — reveal ordering is a slot contract, and a nested `<Reveal>` is ONE
 * composite slot in the enclosing one.
 *
 * Every claim here observes a moment at which an inner group's order and its
 * outer's DISAGREE. That is not a stylistic choice: a FLAT group behaves
 * identically under a coordinator that knows about nesting and one that does
 * not, which is exactly how the flat design survived four passing tests in
 * `reveal.test.ts` while a nested group's outer never learned the inner
 * existed. The first frame is identical in every arm too, so each claim drives
 * a settlement and reads what moved — the same reason K1's fixture has to
 * observe an update.
 *
 * The two questions A6 was written to answer are its clauses (a) and (c). The
 * coordinator STAYS a provide — that is how a `<Loading>` inside a component
 * inside the group still finds it (X3, X4), and this fixture reaches every
 * boundary through exactly that path, since `Leaf` is a component. The boundary
 * gains an ordering channel because after (c) the thing registering is not
 * always a boundary.
 *
 * A6.
 */
import { Loading, Reveal, render, resource } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["A6"]

/** One resolver per named leaf, captured when its fetcher runs. */
const answers = new Map<string, (value: string) => void>()

/**
 * One `<Loading>` over one unsettled read. The read throws `NotReady` until the
 * claim resolves it (A3), which is what makes the boundary pending and so a
 * slot with something to coordinate.
 */
function Leaf(props: { name: string }) {
  const name = props.name()
  const data = resource(
    () => null,
    () =>
      new Promise<string>((resolve) => {
        answers.set(name, resolve)
      }),
  )
  return (
    <Loading fallback={<span class="fallback">{`[f${name}]`}</span>}>
      {() => <span class="value">{() => `${name}:${data()}`}</span>}
    </Loading>
  )
}

let previous: (() => void) | null = null

async function mount(kit: Kit, tree: () => unknown) {
  previous?.()
  previous = null
  answers.clear()
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = render(tree as () => never, host)
  })
  previous = dispose ?? null
  if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
  return host
}

function settleLeaf(name: string): void {
  answers.get(name)?.(name.toLowerCase())
}

function reads(host: HTMLElement): string {
  return JSON.stringify(host.textContent)
}

function shows(kit: Kit, host: HTMLElement, want: string, why: string): void {
  if (host.textContent !== want) {
    kit.fail(`${why}; the container reads ${reads(host)} and A6 requires ${JSON.stringify(want)}`)
  }
}

function suspended(kit: Kit, count: number): void {
  kit.precondition(
    answers.size === count,
    `only ${answers.size} of the ${count} leaves suspended, so there is nothing to order and ` +
      "every claim below would be observing an absence",
  )
}

/** Outer `sequential` over [A, group(B, C)] with the group `natural`. */
function SequentialOverNatural() {
  return (
    <div class="host">
      <Reveal order="sequential">
        <Leaf name="A" />
        <Reveal order="natural">
          <Leaf name="B" />
          <Leaf name="C" />
        </Reveal>
      </Reveal>
    </div>
  )
}

/** Outer `sequential` COLLAPSED over [group(B, C), D], the group not collapsed. */
function CollapsedOverGroupThenLeaf() {
  return (
    <div class="host">
      <Reveal order="sequential" collapsed={true}>
        <Reveal order="sequential">
          <Leaf name="B" />
          <Leaf name="C" />
        </Reveal>
        <Leaf name="D" />
      </Reveal>
    </div>
  )
}

/** Outer `together` over [A, group(B, C)] with the group `sequential`. */
function TogetherOverSequential() {
  return (
    <div class="host">
      <Reveal order="together">
        <Leaf name="A" />
        <Reveal order="sequential">
          <Leaf name="B" />
          <Leaf name="C" />
        </Reveal>
      </Reveal>
    </div>
  )
}

/** Outer `natural` over [A, group(B, C)] with the group `natural`. */
function NaturalOverNatural() {
  return (
    <div class="host">
      <Reveal order="natural">
        <Leaf name="A" />
        <Reveal order="natural">
          <Leaf name="B" />
          <Leaf name="C" />
        </Reveal>
      </Reveal>
    </div>
  )
}

/** Outer `sequential` COLLAPSED over [A, group(B)], the group not collapsed. */
function CollapsedOverLeafThenGroup() {
  return (
    <div class="host">
      <Reveal order="sequential" collapsed={true}>
        <Leaf name="A" />
        <Reveal order="natural">
          <Leaf name="B" />
        </Reveal>
      </Reveal>
    </div>
  )
}

export const claims: Claim[] = [
  {
    id: "a-nested-group-is-held-as-one-slot-then-released-to-run-locally",
    rule: "A6",
    says: "an inner group registers as slot 1 of an outer `sequential`, so its own `natural` order does not run while the outer frontier is on slot 0; once the frontier reaches it, it is RELEASED rather than held and runs its order over whatever is still pending",
    async check(kit) {
      const host = await mount(kit, () => <SequentialOverNatural />)
      suspended(kit, 3)
      shows(kit, host, "[fA][fB][fC]", "the first frame is not three fallbacks")

      // Procedure 1. B settles behind a held group: nothing may move.
      settleLeaf("B")
      await kit.settle()
      shows(
        kit,
        host,
        "[fA][fB][fC]",
        "a leaf inside a HELD nested group revealed on its own schedule, which is what a group " +
          "that registers no slot at all does — the outer's order then means nothing below its " +
          "own first level",
      )

      // Procedure 2. A settles: the group is the frontier and is released.
      settleLeaf("A")
      await kit.settle()
      shows(
        kit,
        host,
        "A:aB:b[fC]",
        "the frontier composite was not released to run its own order — holding it like a leaf " +
          "makes the whole group wait on its slowest member before showing anything",
      )

      settleLeaf("C")
      await kit.settle()
      shows(kit, host, "A:aB:bC:c", "the group did not finish after every leaf settled")
    },
  },
  {
    id: "sequential-advances-on-full-readiness-not-minimal-readiness",
    rule: "A6",
    says: "`sequential` advances past a composite on `ready` — every slot — while `minimallyReady` is only its first; `collapsed` is what makes the frontier's position observable, since past it a slot renders nothing rather than a fallback",
    async check(kit) {
      const host = await mount(kit, () => <CollapsedOverGroupThenLeaf />)
      suspended(kit, 3)
      // The group is the frontier, so it is released and runs its own
      // sequential order under its OWN collapsed policy, which is false.
      shows(
        kit,
        host,
        "[fB][fC]",
        "the first frame is not the released group's two fallbacks with D suppressed",
      )

      settleLeaf("B")
      await kit.settle()
      shows(
        kit,
        host,
        "B:b[fC]",
        "D's fallback appeared, which means the outer advanced past a group that is minimally " +
          "ready and not ready — read `sequential` on `minimallyReady` and the two predicates " +
          "have no reason to be two",
      )

      settleLeaf("C")
      await kit.settle()
      shows(kit, host, "B:bC:c[fD]", "the outer did not advance once the group was fully ready")

      settleLeaf("D")
      await kit.settle()
      shows(kit, host, "B:bC:cD:d", "the tail leaf never revealed")
    },
  },
  {
    id: "together-releases-on-minimal-readiness",
    rule: "A6",
    says: "`together` releases when every direct slot has its own first visible content, so a nested `sequential` counts once ITS first slot is ready — the cohesive reveal does not wait on the slowest grandchild",
    async check(kit) {
      const host = await mount(kit, () => <TogetherOverSequential />)
      suspended(kit, 3)
      shows(kit, host, "[fA][fB][fC]", "the first frame is not three fallbacks")

      settleLeaf("A")
      await kit.settle()
      shows(kit, host, "[fA][fB][fC]", "`together` released before every direct slot was ready")

      // B is the inner sequential's FIRST slot, so the group is minimally
      // ready — and C is still pending, so it is not ready.
      settleLeaf("B")
      await kit.settle()
      shows(
        kit,
        host,
        "A:aB:b[fC]",
        "`together` is still holding after every direct slot became minimally ready, which means " +
          "it is waiting on full readiness and the cohesive reveal never happens until the " +
          "slowest grandchild lands",
      )

      settleLeaf("C")
      await kit.settle()
      shows(kit, host, "A:aB:bC:c", "the last grandchild never revealed")
    },
  },
  {
    id: "natural-always-releases-a-composite",
    rule: "A6",
    says: "under `natural` a nested group is released unconditionally — the mode exists for nesting, and holding a composite would make it a `sequential` of one",
    async check(kit) {
      const host = await mount(kit, () => <NaturalOverNatural />)
      suspended(kit, 3)

      settleLeaf("B")
      await kit.settle()
      shows(
        kit,
        host,
        "[fA]B:b[fC]",
        "the nested group was held until it was ready, which is the rule a LEAF gets — under " +
          "`natural` a composite runs its own order from the first frame",
      )

      settleLeaf("C")
      await kit.settle()
      shows(kit, host, "[fA]B:bC:c", "the second leaf of the released group never revealed")
    },
  },
  {
    id: "a-hold-carries-the-outers-collapsed-policy-down-the-subtree",
    rule: "A6",
    says: "a group held as `nothing` shows nothing anywhere below it, whatever its own `collapsed` says; its own order resumes only once the outer releases it",
    async check(kit) {
      const host = await mount(kit, () => <CollapsedOverLeafThenGroup />)
      suspended(kit, 2)
      shows(
        kit,
        host,
        "[fA]",
        "the held group rendered something; the outer is collapsed and the hold carries that " +
          "policy down, so the inner group's own `collapsed: false` gets no say while it is held",
      )

      settleLeaf("A")
      await kit.settle()
      shows(kit, host, "A:a[fB]", "the group was not released once the frontier reached it")

      settleLeaf("B")
      await kit.settle()
      shows(kit, host, "A:aB:b", "the released group never finished")
    },
  },
]
