/**
 * R7 — a derived signal, `createSignal(fn)`, is writable derived state that
 * RE-SEEDS.
 *
 * The read-copy trap, which is the problem it exists for: `createSignal(props.x())`
 * reads the prop once and freezes at whatever it was, so the local copy and the
 * thing it was copied from drift apart for the rest of the component's life. A
 * memo does not drift, and cannot be written. A derived signal is the pair:
 * writable, and re-derived the next time what it reads moves.
 *
 * Both directions are claims, because a framework that only does one of them
 * passes half of this and is wrong in a way the other half names. A signal that
 * ignores writes is "always re-seeded"; a `signal` copy is "always keeps the
 * write". Only holding both is the rule.
 *
 * The last claim is the one it was designed for: the controlled input. The
 * user's edit is a write, the server's answer is a re-seed, and neither needs a
 * second signal or a reconcile step.
 *
 * R7.
 */
import { createOwner, createSignal, flush, runWithOwner } from "@barqjs/core"
import { render } from "@barqjs/web"
import type { Block } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["R7"]

// Under an owner, as they would be inside a component: a derived value nothing
// owns is released whenever nothing reads it, and a write to it goes with it.
const module = createOwner()

const [serverName, setServerName] = createSignal("ada")
const [draft, setDraft] = runWithOwner(module, () => createSignal(() => serverName()))

/** `compute` receives the previous value, so a re-seed can keep a choice. */
const [options, setOptions] = createSignal(["a", "b", "c"])
const [chosen, setChosen] = runWithOwner(module, () =>
  createSignal<string>((previous) => {
    const list = options()
    return previous !== undefined && list.includes(previous) ? previous : list[0]!
  }),
)

function Draft() {
  return <input type="text" class="draft" bind:value={[draft, setDraft]} />
}

function Chosen() {
  return <b class="chosen">{() => chosen()}</b>
}

async function mount(kit: Kit, build: Block<unknown>) {
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(build as never, host)
  })
  if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0]!.message}`)
  await kit.settle()
  return host
}

export const claims: Claim[] = [
  {
    id: "a-write-holds-until-the-source-moves",
    rule: "R7",
    says: "a derived signal is WRITABLE: a write to it wins over the derivation for as long as the source is unchanged",
    async check(kit) {
      setServerName("ada")
      flush()
      kit.precondition(draft() === "ada", `the seed did not take: ${JSON.stringify(draft())}`)
      setDraft("adamant")
      flush()
      if (draft() !== "adamant") {
        kit.fail(
          `the write was discarded: reading back gives ${JSON.stringify(draft())}. A derived signal ` +
            "that ignores writes is a `computed` with extra steps",
        )
      }
      // And still, with the source untouched.
      await kit.settle()
      if (draft() !== "adamant") kit.fail(`the flush undid the write: ${JSON.stringify(draft())}`)
    },
  },
  {
    id: "the-source-moving-discards-the-write",
    rule: "R7",
    says: "the next change of the source recomputes over the write — which is the read-copy trap, closed",
    async check(kit) {
      setServerName("ada")
      flush()
      setDraft("adamant")
      flush()
      setServerName("grace")
      flush()
      if (draft() !== "grace") {
        kit.fail(
          `the cell still reads ${JSON.stringify(draft())} after its source became "grace". ` +
            "This is `signal(props.value)` freezing at the first value it ever saw, which is " +
            "the defect R7 names",
        )
      }
    },
  },
  {
    id: "compute-is-handed-the-previous-value",
    rule: "R7",
    says: "the re-seed is a function of the source AND the previous value, so `keep the choice if it is still available` needs no second signal to reconcile",
    async check(kit) {
      setOptions(["a", "b", "c"])
      const host = await mount(kit, Chosen as never)
      const shown = () => host.querySelector("b.chosen")?.textContent
      kit.precondition(shown() === "a", `the seed did not take: ${JSON.stringify(shown())}`)

      setChosen("c")
      await kit.settle()
      if (shown() !== "c") kit.fail(`the write did not reach the DOM: ${JSON.stringify(shown())}`)

      // "c" survives, because it is still in the list.
      setOptions(["c", "d"])
      await kit.settle()
      if (shown() !== "c") {
        kit.fail(
          `the choice was dropped on a source change that still contained it: ` +
            `${JSON.stringify(shown())}. \`compute(source, previous)\` is what makes keeping it ` +
            "expressible at all",
        )
      }

      // And is dropped when it is not.
      setOptions(["e", "f"])
      await kit.settle()
      if (shown() !== "e") {
        kit.fail(`the choice was kept although it left the list: ${JSON.stringify(shown())}`)
      }
    },
  },
  {
    id: "the-controlled-input-it-was-designed-for",
    rule: "R7",
    says: "a `bind:` over a derived signal accepts the user's edit AND is re-seeded by the source, with no second copy and no reconcile step",
    async check(kit) {
      setServerName("ada")
      const host = await mount(kit, Draft as never)
      const field = host.querySelector("input.draft") as HTMLInputElement | null
      if (field === null) kit.fail("the input never rendered")
      if (field.value !== "ada") kit.fail(`the field seeded as ${JSON.stringify(field.value)}`)

      field.value = "adamant"
      field.dispatchEvent(new Event("input", { bubbles: true }))
      await kit.settle()
      if (field.value !== "adamant") {
        kit.fail(`the user's edit was overwritten: ${JSON.stringify(field.value)}`)
      }
      if (draft() !== "adamant") kit.fail(`the edit never reached the cell: ${draft()}`)

      setServerName("grace")
      await kit.settle()
      if (field.value !== "grace") {
        kit.fail(
          `the source moved and the field still reads ${JSON.stringify(field.value)}. The whole ` +
            "point of a derived signal behind a controlled input is that the answer from elsewhere " +
            "wins the next time it changes",
        )
      }
    },
  },
]
