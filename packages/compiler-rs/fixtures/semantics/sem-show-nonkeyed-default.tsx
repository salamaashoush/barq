/**
 * K1.1 — a `Show` is NON-KEYED by default, and the asymmetry with `For` is the
 * point.
 *
 * Both claims must observe an UPDATE. The first frame is identical under either
 * mode, which is the same reason the `keyed={fn}` miscompile hid from 110
 * fixtures, and it is why an initial render proves nothing here.
 *
 * The probe is a text control the user has typed into. That is not decoration:
 * what a rebuild costs is exactly the DOM state nothing serialises — a caret, a
 * scroll offset, a running animation, an open `<dialog>`, a third-party widget
 * behind a ref. An `<input>`'s value is the one of those a test can read.
 *
 * The second claim is the CONTROL. Without it, "the default preserves the node"
 * and "this construct never rebuilds anything" are the same observation.
 *
 * SEMANTICS.md §K K1.1.
 */
import { Show, render, signal } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["K1.1"]

export const user = signal<{ name: string } | null>({ name: "alice" })

let previous: (() => void) | null = null

function Keyed() {
  return (
    <div class="host">
      <Show when={() => user()} keyed>
        {(u) => (
          <p>
            <b class="name">{u.name}</b>
            <input class="probe" />
          </p>
        )}
      </Show>
    </div>
  )
}

function Default() {
  return (
    <div class="host">
      <Show when={() => user()}>
        {(u) => (
          <p>
            <b class="name">{() => u().name}</b>
            <input class="probe" />
          </p>
        )}
      </Show>
    </div>
  )
}

async function mount(kit: Kit, which: "default" | "keyed"): Promise<HTMLElement> {
  previous?.()
  previous = null
  user.set({ name: "alice" })
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = render(() => (which === "keyed" ? <Keyed /> : <Default />), host)
  })
  previous = dispose ?? null
  if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
  return host
}

export const claims: Claim[] = [
  {
    id: "the-default-survives-a-change-from-one-truthy-value-to-another",
    rule: "K1.1",
    says: "non-keyed is the default, so the key is truthiness: the content keeps its nodes across a value change and the narrowed accessor is what moves",
    async check(kit) {
      const host = await mount(kit, "default")
      await kit.settle()
      const before = host.querySelector("input.probe") as HTMLInputElement | null
      kit.precondition(before !== null, "the probe input did not render")
      before!.value = "typed by the user"

      // A NEW object, still truthy — the everyday immutable update.
      user.set({ name: "bob" })
      await kit.settle()

      const after = host.querySelector("input.probe") as HTMLInputElement | null
      if (after !== before) {
        kit.fail(
          "the input was replaced, so the content was rebuilt on a value change. That is the " +
            "KEYED behaviour, and under it a caret, a scroll offset and a running animation go " +
            "the same way as the typed text",
        )
      }
      if (after?.value !== "typed by the user") {
        kit.fail(`the typed text is ${JSON.stringify(after?.value)} — the node survived and its state did not`)
      }
      const name = host.querySelector("b.name")?.textContent
      if (name !== "bob") {
        kit.fail(
          `the content kept its nodes but reads ${JSON.stringify(name)}. The children take the ` +
            "narrowed ACCESSOR, so preserving the node is only half of it — the reads have to move",
        )
      }
    },
  },
  {
    id: "keyed-opts-into-rebuilding-and-that-is-the-control",
    rule: "K1.1",
    says: "the CONTROL — `keyed` makes the value the key, so the same update rebuilds and the state goes",
    async check(kit) {
      const host = await mount(kit, "keyed")
      await kit.settle()
      const before = host.querySelector("input.probe") as HTMLInputElement | null
      kit.precondition(before !== null, "the probe input did not render")
      before!.value = "typed by the user"

      user.set({ name: "bob" })
      await kit.settle()

      const after = host.querySelector("input.probe") as HTMLInputElement | null
      if (after === before) {
        kit.fail(
          "`keyed` kept the same node, so this construct rebuilds for nobody and the claim above " +
            "observes nothing. The value IS the key under `keyed`, and a new value is a new instance",
        )
      }
      if (after?.value === "typed by the user") {
        kit.fail("`keyed` rebuilt and the typed text survived it, which cannot both be true")
      }
      const name = host.querySelector("b.name")?.textContent
      if (name !== "bob") {
        kit.fail(`the keyed arm rebuilt and reads ${JSON.stringify(name)} rather than "bob"`)
      }
    },
  },
]
