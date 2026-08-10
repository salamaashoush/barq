/**
 * C6 through the four wrappers that are not values, and C5.1 item 2 at the slot
 * they were erased in.
 *
 * `builds_dom` in `shape.rs` was the single kind predicate in the compiler that
 * did not unwrap `TSAsExpression` / `TSSatisfiesExpression` /
 * `TSNonNullExpression` / parentheses — six sibling predicates in the same file
 * and in `classify.rs` and `bind.rs` all did. So a TypeScript type assertion
 * erased the Block: a plain child crossed as a branded Block, and the same child
 * behind `as never` crossed as a bare nullary thunk building a template.
 *
 * The second is C6's third named falsifier and the one expression §3.0 rule 3
 * says the emitted language does not contain. Run against `packages/core` the
 * first threw `ScopeMissingError` and the second silently built the subtree and
 * stringified it into the attribute — `title="<b>C</b>"` — which is exactly what
 * C5.1 item 2 says MUST NOT happen. A cast was enough to reach it, at -O0 and at
 * -Ox alike.
 *
 * The corpus could not see it: no fixture anywhere had a JSX-valued prop on a
 * user component, and none had a type assertion on JSX.
 *
 * SEMANTICS.md §3 C6, C5.1.
 */
import { render } from "@barqjs/core"

import type { Claim } from "../../test/semantics-support.ts"

export const rules = ["C6", "C5.1"]

interface Slots extends Record<string, unknown> {
  readonly badge: unknown
}

/** The Cell slot: an attribute on an INTRINSIC element, which lowers to setProp. */
function Attr(props: Slots) {
  return <div class="attr" title={props.badge as never} />
}

/** The Block slot: a child position, which C3.7 makes safe for either kind. */
function Slot(props: Slots) {
  return <div class="slot">{props.badge as never}</div>
}

/** The same, through `children` rather than through a named slot. */
function Kid(props: Slots) {
  return <div class="kid">{props.children as never}</div>
}

export const Cast = () => <Slot badge={<b class="leaf">cast</b> as never} />
export const Satisfies = () => <Slot badge={<b class="leaf">satisfies</b> satisfies never} />
export const Paren = () => <Slot badge={<b class="leaf">paren</b>} />
export const Kids = () => <Kid>{(<b class="leaf">kids</b>) as never}</Kid>
export const IntoACellSlot = () => <Attr badge={<b class="leaf">bad</b> as never} />

export const claims: Claim[] = [
  {
    id: "a-type-assertion-does-not-erase-the-block-brand",
    rule: "C6",
    says: "`<b/> as never` lowers to a branded Block exactly as `<b/>` does, in every wrapper spelling and at every slot",
    check(kit) {
      kit.precondition(
        /[\w$]*block\(/.test(kit.emitted),
        "the emitted module contains no Block at all, so nothing here observed a brand",
      )
      const thunks = [...kit.emitted.matchAll(/\(\)\s*=>\s*[\w$]*tmpl\$*\d+\(\)/g)].map((m) => m[0])
      if (thunks.length > 0) {
        kit.fail(
          `the emitted module carries ${thunks.length} nullary thunk(s) building a template ` +
            `(${JSON.stringify(thunks)}). That is C6's third named falsifier: an unbranded value in ` +
            `a slot, which §3.0 rule 3 says the emitted language cannot spell. A TypeScript ` +
            `assertion is not a value and may not change what a JSX expression lowers to`,
        )
      }
    },
  },
  {
    id: "every-jsx-slot-on-a-user-component-is-branded",
    rule: "C6",
    says: "a JSX-valued prop on a user component crosses as a Block, not as a Cell and not as a built node — the slot name is not part of the rule",
    check(kit) {
      // Five call sites, five JSX values: three named slots under three wrapper
      // spellings, one `children`, and one aimed at a Cell slot.
      const brands = [...kit.emitted.matchAll(/[\w$]*block\(/g)].length
      if (brands < 5) {
        kit.fail(
          `only ${brands} of the five JSX slots in this fixture are branded. Before the wrapper ` +
            `arms were added to \`builds_dom\`, three of them were bare thunks and only \`Paren\` ` +
            `and the un-cast forms survived`,
        )
      }
    },
  },
  {
    id: "a-block-in-a-cell-slot-throws-rather-than-stringifying",
    rule: "C5.1",
    says: "item 2: a Block reaching an attribute is invoked with no scope and throws, and never renders its subtree into the attribute",
    async check(kit) {
      const host = kit.container()
      const thrown = await kit.attempt(() => {
        render(IntoACellSlot as never, host)
      })
      await kit.settle()
      const names = thrown.map((t) => t.name)
      if (!names.includes("ScopeMissingError")) {
        kit.fail(
          `a Block reached an attribute slot and ${names.length === 0 ? "nothing threw" : names.join(", ")}; ` +
            `the container holds ${JSON.stringify(host.innerHTML)}. C5.1 item 2 says this MUST NOT ` +
            `silently render under CURRENT and MUST NOT silently produce undefined — the unbranded ` +
            `thunk form did the first and wrote the subtree's markup into the attribute`,
        )
      }
      if (host.innerHTML.includes("<b")) {
        kit.fail(
          `the attribute slot rendered a subtree: ${JSON.stringify(host.innerHTML)}. That is the ` +
            `stringified-Block outcome the brand exists to prevent`,
        )
      }
    },
  },
  {
    id: "control-the-same-value-in-a-child-slot-renders",
    rule: "C6",
    says: "the same cast value in a CHILD slot builds normally, which is what makes the throw beside it a statement about the slot and not about the cast",
    async check(kit) {
      for (const [what, Subject] of [
        ["as", Cast],
        ["satisfies", Satisfies],
        ["parenthesised", Paren],
        ["children", Kids],
      ] as const) {
        const host = kit.container()
        const thrown = await kit.attempt(() => {
          render(Subject as never, host)
        })
        await kit.settle()
        kit.precondition(host.innerHTML.length > 0, `${what} rendered nothing at all`)
        if (!host.innerHTML.includes("leaf") || thrown.length > 0) {
          kit.fail(
            `the ${what} spelling in a child slot rendered ${JSON.stringify(host.innerHTML)} ` +
              `(${thrown.map((t) => `${t.name}: ${t.message}`).join("; ") || "no throw"}). This is the ` +
              `CONTROL: C3.7 makes a child position accept either kind, so all four must build`,
          )
        }
      }
    },
  },
]
