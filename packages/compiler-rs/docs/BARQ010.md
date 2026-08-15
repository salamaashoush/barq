# BARQ010 — a Block forwarded into a Cell slot

**Level:** warning · **Rule family:** C5.1 item 1 · [all codes](README.md)

## What fires

A JSX value — which lowers to a `Block`, a deferred construction taking the receiving
scope (C6) — written into a slot the callee reads as a `Cell`.

```jsx
function Sink(props) {
  return <div title={props.children} />      // props.children is read as a Cell here
}

export function App() {
  return <Sink><b>hello</b></Sink>           // BARQ010
}
```

The diagnostic is reported at the **forwarding site**, because that is where the fix is
written, and its message names the consuming position inside the callee.

## Why it is a compile-time question at all

`SEMANTICS.md` C5.1 says a Block landing in a Cell slot arises exactly two ways, and each
has a defined outcome:

1. **Within a module**, the compiler knows both ends — the value's kind, because it lowered
   it, and what the callee does with it, because the callee is right there. That is this
   code.
2. **Across a module boundary**, the compiler cannot know
   ([`CODESIGN.md` §3.13 item 1](../CODESIGN.md)). The consumer's `props.x()` then hits
   C3.8 and throws `ScopeMissingError`.

Item 2 is the safety net and it always fires. This code is item 1: the same defect, found
before the program runs, in the case where finding it is possible.

## What actually happens without it

A `Cell` is invoked with no argument. A `Block` reaching a Cell slot is **refused** with
`ScopeMissingError` naming the Block's origin — it does not fall back to `CURRENT` and it
does not stringify. So the program that produces this diagnostic is a program that throws
on the first render of that element.

At an ordinary attribute the refusal is the Block's own entry guard: it is invoked with no
scope, and `scope === undefined` throws. At **`ref` and `on*` it cannot be**, because those
two positions invoke the value with the ELEMENT and with the EVENT — neither is
`undefined`, so the guard is structurally unreachable and a forwarded Block would have run
with a DOM node or an Event as its scope, parenting everything it built to something root
disposal never reaches. The refusal there is a test on the VALUE's brand, taken where the
value is read: in `applyRefs`, in `listen`/`delegate`, and in the delegated dispatcher —
which is the only place a compiled `_el$1.$$click = h` expando can be seen at all.

Before M4b's fix round it did not even throw in one spelling: `builds_dom` in `shape.rs`
did not see through a TypeScript assertion, so `<Sink>{<b>C</b> as never}</Sink>` emitted
an unbranded nullary thunk, `_$setProp` invoked it, and the built subtree was stringified
into the attribute — `<div title="<b>C</b>">`. That is C5.1 item 2's stated MUST NOT, and a
type cast was enough to reach it.

## The fix

Render it where a Block belongs — a child position takes either kind (C3.7):

```jsx
function Sink(props) {
  return <div>{props.children}</div>
}
```

or hand the callee a **Cell**, which is what an attribute slot wants:

```jsx
function Sink(props) {
  return <div title={props.label} />
}

export function App() {
  return <Sink label={() => "hello"} />
}
```

## What is a "Cell slot"

Any **attribute on an intrinsic element**, which lowers to `_$setProp` / `_$spread` or to
a resolved channel — including `ref` and `on*`, which are channels rather than props but
are still positions that consume a value rather than a Block. A child position is not one — C3.7 makes a Cell in a Block slot
degrade harmlessly, so both kinds are legal there. An attribute on a **component** is not
one either; it is a forward, and its verdict is the callee's.

The verdict propagates through forwards to any depth inside the module:

```jsx
function Sink(props) { return <div title={props.thing} /> }
function Mid(props)  { return <Sink thing={props.thing} /> }   // Mid.thing is a Cell slot too
export function App() { return <Mid thing={<b/>} /> }          // BARQ010
```

## What does not fire

- **Anything cross-module.** `analysis::bind` is module-scoped, so a callee imported from
  another file has no known slots at all. Item 2's runtime throw is what answers there.
- **A slot read only in a child position**, or read through a spread, a computed member
  (`props[key]`) or a destructure — none of those is a proven Cell position.
- **Anything on the far side of a spread.** `analysis::bind` collects a pair only from a
  NAMED attribute, so a spreading wrapper (`<Sink {...props} />`) and a spread at the
  forwarding site both end the fixpoint's chain and compile clean. Item 2 fires in both.
- **A production build.** The code is DEV-only; item 2 is what a release build has.
- **A flow component.** `<Show when={…}>` is not an in-module declaration; the primitives'
  slots are typed, and a Block reaching one of them throws under C3.8.
- **A callee this module never declares**, including a member tag (`<ns.Comp/>`) and a
  `this` tag, which resolve to no `SymbolId`.

The rule is deliberately one-sided: it fires only where the compiler has proof, and stays
silent everywhere else. Silence is not a claim that the slot is safe.

## Silencing it

```jsx
{/* barq-ignore-next-line BARQ010 (Sink stringifies deliberately, for the debug panel) */}
<Sink><b>hello</b></Sink>
```
