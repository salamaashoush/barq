/**
 * C6's last sentence, which had no pin: **slot parameters are extra `Cell`
 * arguments to the Block.**
 *
 * §13 named `sem-own-slot-arguments` for this half three times and the file did
 * not exist anywhere in the repository. The gate that is supposed to catch that
 * — "a rule whose prose claims HOLDS is pinned by a fixture that exists" — used
 * `named.some(...)`, so C6 read HOLDS on the strength of its four SIBLING pins
 * while the pin for the half nobody had checked was fiction. The half turned out
 * to be the one M4b's gate round found broken, which is why the fixture is here
 * rather than the name being deleted.
 *
 * The claim is one shape with three consequences, and each is separately
 * falsifiable:
 *
 *  1. the scope is FIRST and the slot arguments follow it — the arity guess that
 *     handed a row callback the Scope where its item belongs is what the brand
 *     replaced (C3.8, C3.9);
 *  2. the slot arguments obey the kind table `each` documents, and the by-item
 *     row VALUE is a plain value while its index is a Cell (K1, C3.6);
 *  3. a row Block written by the author already carries the convention, so the
 *     compiler forwards it BY NAME and mints no closure at the hop (C5).
 *
 * SEMANTICS.md §3 C6.
 */
import { each, enterRoot, exit, dispose, signal } from "@barqjs/core"
import type { Scope } from "@barqjs/core"

import type { Claim } from "../../test/semantics-support.ts"

export const rules = ["C6"]

interface Row {
  readonly id: number
  readonly label: string
}

const rows = signal<readonly Row[]>([
  { id: 1, label: "one" },
  { id: 2, label: "two" },
])

/** A row Block written the way an author writes one: scope first, slots after. */
function line(_s: Scope | null, item: Row, index: () => number) {
  return document.createTextNode(`${index()}:${item.label}`)
}

export const Subject = () => <b class="slots">slot-arguments</b>

/** Drive `each` under a root of its own and hand back what the row observed. */
function drive(
  keyOf: ((item: Row) => unknown) | false | null,
  row: (s: Scope | null, ...slots: never[]) => Node,
): { host: HTMLElement; done: () => void } {
  const host = document.createElement("div")
  const root = enterRoot()
  each(root, host, null, () => rows(), keyOf as never, row as never)
  exit(root)
  return { host, done: () => dispose(root) }
}

export const claims: Claim[] = [
  {
    id: "the-scope-comes-first-and-the-slots-follow-it",
    rule: "C6",
    says: "a row Block is invoked as `(scope, item, index)` — the scope is argument zero and the slot values are extra arguments after it, never in its place",
    check(kit) {
      const seen: string[] = []
      const { host, done } = drive(null, ((s: Scope | null, item: Row, index: () => number) => {
        seen.push(
          `${s === null || s === undefined ? String(s) : "scope"}|` +
            `${typeof item}|${typeof index}`,
        )
        return line(s, item, index)
      }) as never)
      try {
        kit.precondition(seen.length === 2, `the row Block ran ${seen.length} time(s), not 2`)
        const wrong = seen.filter((shape) => shape !== "scope|object|function")
        if (wrong.length > 0) {
          kit.fail(
            `a row Block was invoked with argument shapes ${JSON.stringify(seen)}. C6 says the ` +
              `scope is FIRST and the slot values are extra arguments after it; guessing the ` +
              `positions from arity is what handed a row callback the Scope where its item belongs`,
          )
        }
        if (host.textContent !== "0:one1:two") {
          kit.fail(
            `the rows rendered ${JSON.stringify(host.textContent)}, so the slot arguments did not ` +
              `reach the body in the order the table says`,
          )
        }
      } finally {
        done()
      }
    },
  },
  {
    id: "the-slot-arguments-carry-the-kinds-the-table-declares",
    rule: "C6",
    says: "`keyOf` decides the kinds: by item the row value is a plain value and the index is a Cell; keyed by index it is the other way round",
    check(kit) {
      const kinds: Record<string, string> = {}
      const record = (mode: string) =>
        ((_s: Scope | null, item: unknown, index: unknown) => {
          kinds[mode] ??= `${typeof item}/${typeof index}`
          return document.createTextNode("x")
        }) as never
      const byItem = drive(null, record("byItem"))
      const byIndex = drive(false, record("byIndex"))
      const byFn = drive((row: Row) => row.id, record("byFn"))
      try {
        kit.precondition(
          Object.keys(kinds).length === 3,
          `only ${Object.keys(kinds).length} of the three modes ran`,
        )
        const want = { byItem: "object/function", byIndex: "function/number", byFn: "function/function" }
        const wrong = Object.entries(want).filter(([mode, shape]) => kinds[mode] !== shape)
        if (wrong.length > 0) {
          kit.fail(
            `the slot argument kinds are ${JSON.stringify(kinds)}, and the table in flow.ts ` +
              `declares ${JSON.stringify(want)}. A slot argument whose kind is guessed rather than ` +
              `declared is the classic name-heuristic defect: \`item()\` on a plain object throws`,
          )
        }
      } finally {
        byItem.done()
        byIndex.done()
        byFn.done()
      }
    },
  },
  {
    id: "a-row-block-is-forwarded-by-name-not-re-wrapped",
    rule: "C6",
    says: "a function that already takes the scope IS a Block with slot parameters, so the compiler forwards it by identity rather than minting a wrapper",
    check(kit) {
      // `scope.rs` gives every JSX-bearing declaration the scope parameter, so a
      // row body written as a named function needs no wrapping at all. A
      // re-wrap would spell `line` as `(_s$) => line(...)` or `() => line`,
      // either of which is one carrier too many and destroys the brand.
      if (/=>\s*line\b/.test(kit.emitted) || /line:\s*\(\)\s*=>/.test(kit.emitted)) {
        kit.fail(
          "the emitted module re-wraps the row body instead of forwarding the name. C5 says " +
            "forwarding is identity, and C6 says a function that already declares the scope IS " +
            "the Block — wrapping it makes the consumer's `x($c)` hand back the wrapper",
        )
      }
    },
  },
]
