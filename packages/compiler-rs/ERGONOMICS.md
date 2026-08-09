# Ergonomics

What it costs to write barq, what that cost is made of, and which of it we should pay down.

Scope: this is a decision document, not a survey. It draws on four inputs — a survey of Solid's
reported pain, a survey of what React developers get wrong on arrival, a prior-art review of
Vue/Svelte/Angular/Qwik/Marko/React Compiler, and a ground-truth read of this repo — plus a
verification pass through the real napi binary. Every claim below carries a source: a URL for
external evidence, `file:line` for ours. Claims marked **(verified)** were compiled or executed
during this write-up, not inferred.

---

## 1. The shape of the problem

Sixty-odd individual complaints reduce to three patterns. The symptom list is the least useful part
of the research; these are the part that decides anything.

### 1.1 The failure is always a copy, never a read

Sort every silent-wrong-behaviour complaint by mechanism and they collapse into one operation: a
live container's value is copied into an inert slot.

`const { name } = props` · `splitProps` · `mergeProps` · `{...props}` · `Object.assign({}, props)` ·
`const x = sig()` · `Provider value={count()}` · `onClick={props.onClick}` ·
`createSignal(props.count)` · `const Layout = layouts[name()]` · `<For>` rows keyed by a replaced
object identity · `class={cls()}`.

Every one is a copy out of a getter or an accessor. None of them is a bad *read*; the read is
correct and produces the right value, once. That is why a React developer's entire debugging
vocabulary returns "the value is right" — because it was right, at the moment they looked.

This matters because a copy is a *shape*, not a heuristic. `oxc_semantic` resolves reactivity by
SymbolId in `analysis::bind`, which is strictly more information than `eslint-plugin-solid` has —
that rule's escape hatches are the identifier prefixes `initial`, `default` and `staticProp`
([docs/reactivity.md](https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/reactivity.md)),
i.e. the ecosystem's state of the art decides reactivity by how you spelled the variable. We do not
have to.

The corollary that reorders the roadmap: **the highest-value fixes are the ones that stop the copy
from being lossy, not the ones that warn about it.** Four warnings is worse than zero bugs.

### 1.2 The compiler's contract is invisible at the use site

barq has two execution paths that agree on the first frame and diverge forever after. `createElement`
copies the props object (`packages/core/src/dom.ts:306-313`) and treats a bare hole as a one-shot
value. The compiled path emits getters and live bindings. Four fixtures declare the divergence
explicitly via `goesLive`/`wins` exports (`fixtures/component-getter-props.tsx:22-45`,
`fixtures/auto-thunked-read.tsx:19-48`); `DESIGN.md:1659-1664` names it O4.

Nothing in the source text, the type system, or the runtime tells a reader which path a file is on.
`IsCompilerMode` is a global `declare global` block the user hand-writes
(`packages/kitchen-sink/src/barq.d.ts`) with nothing checking it against the build. `StrictChild` —
the one type that would have made the strict path visible — is exported (`packages/core/src/index.ts:88`)
and referenced by zero call sites.

This is the same failure Vue post-mortemed on Reactivity Transform ("no obvious indication other
than the declaration site", [rfcs#369](https://github.com/vuejs/rfcs/discussions/369)) and the same
one Svelte answered with a file extension. barq's boundary is JSX, which is self-marking, and that
is genuinely worth protecting. But the *props-getter* half of the contract leaks past JSX into every
component body, and that half is unmarked.

The invisibility has a second face that no input caught and that I verified this session: **O4
auto-thunking has a hole exactly where real code is most often dynamic.** `class`, `style`,
`classList`, `ref` and `dangerouslySetInnerHTML` carry `NameFlags::STATEFUL_DIFF`
(`src/ir/intern.rs:157-165`), and `passes/classify.rs:118-120` returns `None` for them — the value
goes to `setProp` unwrapped so the runtime keeps its own diff thread. **(verified)**:

```js
// class={c()} — proven reactive, then deliberately dropped
_$setProp(_el$1, "class", c());          // one-shot, in BOTH paths, no warning
// title={c()} — same expression, different name
_$renderEffect((_p$ = {}) => { const _v$1 = c(); … });   // live
```

The reasoning at `classify.rs:108-117` is sound (`element.className = …` on an effect run triggered
by an unrelated prop wipes every class another channel put there). The consequence is not: the most
commonly dynamic attribute in real code is the one place where a called accessor is silently inert,
and the compiler has *already proved it reactive* one line before it drops it.

### 1.3 Both halves of the answer are built, and almost none of it is wired up

- `Diag { level, span, message }` exists (`src/ir/symbols.rs:229-234`); two call sites use it
  (`src/passes/shape.rs:278`, `:289`).
- `compile.rs:483-493` maps both `DiagLevel::Note` and `::Warning` to `Severity::Warning`, keeping
  the level only as a `"note: "` string prefix.
- `line_column(source, diag.span.start)` (`compile.rs:482`) is the only consumer of the span; the
  byte offset Rollup's `pos` wants is discarded.
- `TransformResult.warnings` is `Vec<String>` (`lib.rs:20-26`), so the struct that already carries
  filename/line/column is flattened at the napi boundary.
- `packages/compiler/src/vite.ts:169-171` is `this.warn(warning)` with no second argument, so no
  code frame exists anywhere, in any mode. **(verified)** the emitted shape today:
  `a.tsx:3:22: warning: Dynamic spreads its props...`
- Runtime: five structured codes exist, and `emitDiagnostic` returns immediately unless someone has
  manually called `DEV.diagnostics.subscribe()` (`packages/core/src/signals.ts:120,139`).

And the capability side is the same story. `keyed={(i) => i.id}` — the community `<Key by>` component
Solid users install from solid-primitives — ships in core (`packages/core/src/components.ts:255-269`),
has zero fixtures and zero docs. `storePath` ships as the deep-path escape hatch
(`packages/core/src/store.ts:733`) and nothing points at it. `href={resolvedHref}` typechecks, works
in both paths, and the framework's own router does not do it (`packages/extra/src/router.tsx:1433`).

**The gap is not detection and not capability. It is delivery and discoverability.** That reorders
M8: the diagnostics engine is not infrastructure preceding the interesting rules, it is the single
item that unblocks a third of this document.

---

## 2. What applies to barq and what does not

barq is not Solid. Being precise about this is what keeps us from importing rules that would fire on
our own idiom.

### Already avoided — do not port the rule

| Solid complaint | Why it does not land here |
| --- | --- |
| Direct store mutation is a silent no-op | The read proxy's `set`/`deleteProperty` traps warn and `return false` (`packages/core/src/store.ts:196-204`), which under ESM strict mode is a hard `TypeError`. |
| `useContext` returns `undefined` in four unrelated situations | Throws `ContextNotFoundError` when there is no provider and no default (`packages/core/src/signals.ts:2373`), and always returns an accessor. |
| Dep arrays silently absorbed as `createEffect`'s initial value | `useEffect` (`hooks.ts:35`) and `useMemo` (`hooks.ts:28`) each take exactly one parameter — a second argument is an excess-argument type error with no runtime path. |
| `use:` directives deleted by TypeScript import elision | No `use:` namespace exists. `ref` accepts a callback, a `{current}` object, or an **array** of either (`dom.ts:359-376`), so directives are ordinary value-position imports. Solid 2.0 is removing `use:` to converge here. |
| `classList` needed for object-form classes | `class` accepts `string \| string[] \| Record<string, boolean>` (`jsx-runtime.ts:475-478`). |
| Split-phase `createEffect` verbosity (Solid 2.0) | `effect` is single-function; async correctness comes from the wave-stamp/microtask-flush model. |
| `{signal}` in JSX children/attributes is a mistake | **The opposite here.** Every intrinsic prop is `FunctionMaybe<T>` (`jsx-runtime.ts:51`) and `applyProp` binds any function value reactively (`dom.ts:379-386`) in both paths. `<div id={count}>` is the fine-grained idiom. `ROADMAP.md:196-201` forbids porting eslint-plugin-solid's JSX arm and is right. |

### Lands identically

- **Props destructuring freezes every prop.** `function Chip({ text, tone })` emits
  `_$setProp(_el$1, "data-tone", tone)` and `_$insert(_el$1, text)` — both one-shot, no warning
  **(verified)**. `fixtures/props-destructured-param.tsx:5-11` calls it "the commonest way real code
  loses reactivity by accident".
- **`For`/`Index` invert `(item, index)`.** `ForProps` is a discriminated union
  (`components.ts:222-246`) so TypeScript catches the arity mismatch when parameters are annotated,
  but `keyed: false` *delegates to `Index`*, so flipping one boolean inverts both parameters.
- **Eager `<Show>` children crash on null.** `<Show when={() => u()}><span>{u().name}</span></Show>`
  compiles to an IIFE that constructs the child immediately **(verified)**; `shape.rs:305-318` states
  the refusal to manufacture a thunk is deliberate and
  `fixtures/control-flow-show-eager-children.tsx` asserts it.
- **`Provider value={count()}` freezes the subtree.** Not a compiler problem — P4 emits
  `get value() { return c() }` **(verified)** — the Provider reads `props.value` once into
  `owner._context` (`signals.ts:2282-2288`).
- **Handler props bound once.** `onClick={props.onClick}` emits
  `_$setProp(_el$1, "onClick", props.onClick)` **(verified)**, and `applyProp`'s `on*` branch
  (`dom.ts:346-358`) registers the listener and returns before the `isSignalGetter` check at
  `dom.ts:380`.
- **Early return pins the branch.** `if (loading()) return _tmpl$1();` **(verified)**.
- **TypeScript cannot narrow across an accessor call.**
  ([solid#1527](https://github.com/solidjs/solid/discussions/1527),
  [#1575](https://github.com/solidjs/solid/discussions/1575),
  [#2031](https://github.com/solidjs/solid/discussions/2031))

### Worse than Solid

- **`splitProps` / `mergeProps` / `merge` / `omit` flatten getters.** All four do
  `result[key] = source[key]` in a `for…in` (`components.ts:1240-1250, 1268-1285, 1295-1302,
  1315-1322`); Solid implements these on forwarding getters precisely to avoid it. No fixture in the
  111-file corpus uses either, and `rendering.test.ts:926-985` only exercises them over plain
  objects.
- **`useState`'s getter is strictly weaker than `signal()`'s.** `hooks.ts:11-22` builds a fresh
  `() => s()` closure, dropping `.peek`, `.set` and `.update`. The React-named API is the weaker one
  and it is what the kitchen-sink demo uses throughout.
- **`DeepReadonly` maps function-typed members to `{}`** (`store.ts:17`), so store methods are
  already uncallable through the read type, and `unwrap` (`store.ts:437-440`) does not launder the
  readonly wrapper it exists to remove.

### New, not in Solid at all

- **The compiled/uncompiled behavioural split** (§1.2). Solid has one path; we have two that agree
  on the first frame.
- **The stateful-diff hole** (§1.2). `class={c()}` inert while `title={c()}` is live.
- **`keyed={fn}` is miscompiled.** See §4.3 — this is a correctness bug, not an ergonomic one.

### The evidence that discipline is not a workaround

`packages/extra/src/router.tsx:1403-1406`: `Link` reads `state.location()` at component construction
and closes over the snapshot, so relative href resolution never re-runs on navigation. `NavLink`,
sixty lines later at `:1466`, reads `location()` *inside* the memo and is correct **(verified)**. Two
visually near-identical components, one broken, in the framework's own code, written by its author.

Note what this costs the whole strategy: **that bug is invisible to every rule proposed in this
document, including D1.** `state.location()` is a member call on the result of a cross-module
`useRouterState()`, which P0 Bind resolves to `Opaque`, and the misuse is a plain `const`
initialiser, not an operand position. Static detection has a floor, and this is where it sits.

---

## 3. The prior art verdict

Three large experiments have been run on exactly the question this project keeps circling.

**Vue shipped implicit accessor calls and removed them.** Reactivity Transform (`$ref`/`$computed`/
`$()`/`$$()`) shipped experimental in 3.2, deprecated in 3.3, removed in 3.4. Evan You's drop
rationale (288 reactions,
[rfcs#369](https://github.com/vuejs/rfcs/discussions/369)) names four causes, none of them
implementation defects: losing the marker makes it hard to tell what is tracked, especially in large
codebases; confining it to SFCs creates two mental models; the vars↔refs conversion is unavoidable
and is "one more thing to learn"; and fragmentation — users objected to reading colleagues' code
written in the other dialect. His compressed version, replying to Rich Harris on
[HN](https://news.ycombinator.com/item?id=37584224): *"compiler-magic now invades normal JS/TS files
and alters vanilla semantics. Variable assignments can now potentially be reactive - but there is no
obvious indication other than the declaration site."*

There is also a tooling tax that survives any implementation: `eslint no-const-assign`, `tsc` and
VSCode all flag `foo = false` because none of them know it compiles to `foo.value = false`.

**Svelte moved *toward* explicitness as a major version's flagship.** Runes exist because the `$:`
heuristic only worked at the top level of components, so moving code to a `.js` file silently changed
its behaviour; and because compile-time dependency analysis genuinely fails —
`$: area = multiplyByHeight(width)` never tracks `height`
([svelte.dev/blog/runes](https://svelte.dev/blog/runes)). `$derived`/`$effect` determine dependencies
*at execution time*. **The framework with the best static dependency analysis in the industry
replaced it with runtime tracking on purpose.** That is a guard rail for everything below: reject any
proposal that moves dependency determination into the compiler. barq's split — compile-time DOM
lowering, runtime dependency tracking — is the endpoint everyone converged on.

Svelte also supplies the diagnostic template. `non_reactive_update` and `state_referenced_locally`
([compiler-warnings](https://svelte.dev/docs/svelte/compiler-warnings)) cover exactly our `count * 2`
class, suppressed per line with `// svelte-ignore <code>`. And they supply the cost: issues #11883,
#12877, #16343, #16608 and #17289 are all users pushing back on `state_referenced_locally` as
confusing or over-firing. Ship the suppression comment in the same change as the rule, not after.

**Vue's one surviving transform is the template for a justified widening.** Reactive props destructure
([rfcs#502](https://github.com/vuejs/rfcs/discussions/502)) shipped experimental in 3.3 and is stable,
on-by-default in 3.5. It survived on one argument: *"Props is a component-only concept, and reactive
props only ever exist inside SFCs. Unlike Reactivity Transform, the boundary here is very clear. The
magic never leaks into normal JS/TS code."* It also emits a hard **compile error**, not a warning,
for the one construct it cannot make safe (`watch(foo, …)`). Any widening we ever propose must meet
all three conditions: keyed on a syntactically identifiable declarator, confined to a region the
compiler already owns, and shipping the error arm first.

**React Compiler's bail-out policy is the model for what a conservative compiler owes its user.**
It "safely skips optimization rather than risk changing your app's behavior", bailouts are silent by
design, and the team refused to put non-actionable bailouts in ESLint on noise grounds
([reactwg/react-compiler#24](https://github.com/reactwg/react-compiler/discussions/24)). Their own
honest note: *"Most of the time, if you encounter an issue with React Compiler, it's a runtime
issue… the compiler mistakenly compiled a component it should have skipped."* Two transferable
points: separate actionable diagnostics from informational ones and route them to different surfaces;
ship the opt-out as an in-source directive (`"use no memo"`), not a config key.

**And the readability gap is an IDE problem everywhere it has been solved.** Vue answered "you can't
tell it's a prop" with inlay hints in `@vue/language-tools` 2.1, not a language change. React plans
an LSP surface for bailouts. If we want to close §1.2's legibility gap without touching semantics,
that is where the shipped answer lives.

### What this implies for barq

1. **Implicit accessor calls are settled.** The pipeline forbids them and the only large-scale
   experiment ever run removed them for reasons that are about legibility and social fragmentation,
   not implementability. Stop looking for a way around it. `ROADMAP.md:872-884` already makes this
   argument; it is correct.
2. **We are currently in the worst square: no implicit calls AND no warning.** Vue's users at least
   got `.value` back as a marker. Ours get nothing.
3. **Where prior art argues *against* something attractive:** a props-destructure rewrite looks
   defensible on Vue's precedent, and §5.2 explains why it is not defensible *here* for a reason Vue
   did not have.
4. **Our "works in any file" property is an asset.** Svelte pays for its visible boundary with the
   loudest live complaint about Svelte 5 — runes not working in plain `.ts`, described as "unpleasant
   code infection". Vue and Solid are cited as comparing favourably. We currently have that property
   for free because JSX is self-marking. Any widening spends it.

---

## 4. The ranked proposals

Each carries: the complaint, the proposal, before/after, mechanism, both reviewers' verdicts,
silent-failure risk, and value against cost. Where the reviewers disagreed, both arguments are given.

---

### 4.1 The diagnostics engine (M8a)

**Complaint.** Two compile-time messages and five runtime codes exist; none of them reliably reaches
a developer. §1.3 has the five specific lines.

**Proposal.** Add `code: &'static str` to `Diag` and a third `DiagLevel::Error`. Widen
`compile::Severity` to three variants; stop the `"{level}: "` prefix at `compile.rs:489`. Keep
`diag.span.start` as a `pos` field. Replace `TransformResult.warnings: Vec<String>` with a
`#[napi(object)]` struct carrying `{code, level, file, line, column, endLine, endColumn, message}`.
Pass `position` to `this.warn`. Suppression via `// barq-ignore-next-line BARQ001 (reason)` — code
mandatory, reason required, scoped to code *and* span, unused suppression a warning and never an
error. Project severity map with one resolution shared by compiler/Vite/CLI. Separately, and
independently: default `DEV.diagnostics` on in dev with a console sink.

**Before / after.**

```
today: this.warn("note: For: the origin of `each`…")
       → one unpositioned line, no frame, same severity as a hard warning
after: BARQ004 note at src/App.tsx:14:9, caret'd frame, suppressible per span,
       silenceable per code in config
```

**Mechanism.** Compiler + Vite plugin infrastructure. No stage boundary crossed: diagnostics are
already collected into `module.env.diagnostics` and read once after `passes::run` (`compile.rs:268`).
Zero new traversals.

**Verdicts.** Structural: *feasible as described*. Adversarial: *feasible as described*, with one
correction to the sequencing — the engine gates D1/D3/BARQ005/BARQ007/BARQ008 but **not** the runtime
codes, which need only `diagnosticsOn` defaulted true (`signals.ts:120`). That is one line and zero
compiler work; do not sequence it behind the engine.

**Silent-failure risk.** None from the engine. It removes one: a diagnostic that fires and is never
seen is indistinguishable from no diagnostic, which is the state today for the O3 note and all five
runtime codes.

**Cost trap.** `line_column` (`compile.rs:542-558`) is O(source) per diagnostic — fine for today's
two, quadratic once a rule fires fifty times in a file. Build a line index once.

**Value: high. Cost: medium.** Prerequisite for a third of this document.

---

### 4.2 Two zero-heuristic diagnostics that fall out of the engine

These are grouped because they share a property nothing else here has: **the compiler has already
computed the fact and thrown it away.** Neither needs a heuristic, a name list, or a whitelist tuned
by hand.

#### D0 — a proven-reactive value handed to a stateful-diff prop

**Complaint (new, verified this session).** `class={c()}`, `style={{color: c()}}`,
`classList={…}`, `ref={…}` and `dangerouslySetInnerHTML` are inert when given a called accessor, in
both paths, silently — while the identical expression on `title` is live. §1.2 has the emitted
output.

**Proposal.** At `passes/classify.rs:118`, the compiler reaches the `STATEFUL_DIFF` branch *only
after* `self.live_prop(rx)` returned true — i.e. it has proven `React::Reactive` and is about to
deliberately drop the binding. Emit a note there naming the prop and printing the accessor form.

**Before / after.**

```jsx
// before — proven reactive, silently applied once
<button class={cls()} />        →  _$setProp(_el$1, "class", cls());

// after — same emitted output, plus:
// BARQ00x note at 3:17 — `class` applies its value once; the runtime threads its own
// diff. Pass the accessor instead: class={cls}
<button class={cls} />          →  _$setProp(_el$1, "class", cls);      // live
```

**Mechanism.** Compiler diagnostic. One branch in a pass that already runs.

**Verdicts.** Not seen by either reviewer — this is new. Structurally it is the cheapest rule in the
document: the condition is already evaluated, the span is already in hand, and there is no analysis
to add. It should be re-reviewed before implementation on that basis alone.

**Silent-failure risk.** None — diagnostic only, codegen untouched. False-positive rate is
structurally zero: the rule fires exactly when the compiler proved reactivity and declined to bind
it. There is no correct program in this position.

**Value: high. Cost: small (after the engine).**

#### D1 — an accessor read in a position where no correct program can put one

**Complaint.** `` `${count}` ``, `String(count)`, `-count`, `!count`, `count + ""` produce garbage
and nothing warns. `<p>{`total: ${count}`}</p>` compiles to
`_$insert(_el$1, `total: ${count}`)` with `warnings: []` **(verified)**. The kitchen-sink demo ships
this bug (§4.4).

**Proposal.** Ship exactly as `ROADMAP.md:175-224` scopes it: a signal-typed binding, SymbolId
resolved, in a position allowlist borrowed from `vue/no-ref-as-operand` — `IfStatement`,
`SwitchStatement`, `UnaryExpression`, `UpdateExpression`, `BinaryExpression`, `AssignmentExpression`
(skipping a plain `=` RHS), `LogicalExpression` left operand only, `ConditionalExpression` test only,
`TemplateLiteral` excluding tagged, `MemberExpression` object position excluding computed. The rule
is "no correct program could put a signal here", not "this looks reactive".

Note the target has moved: `tsc --strict` already catches `count * 2` (TS2362), `count > 1` (TS2365),
`count ? a : b` (TS2774). What it misses is the coercion family above, plus every JS user.

**Mechanism.** Compiler diagnostic in `analysis::bind`.

**Verdicts.** Structural: *feasible as described*, with one implementation constraint the proposal
omits — `env.kind` is not final until `fixpoint()` (`bind.rs:269-293`), so a rule must record
`(span, SymbolId)` candidates during the walk and evaluate them after. That keeps it at zero new
traversals. Adversarial: *feasible with changes*, and the changes are load-bearing:

- The `MemberExpression` object-position arm fires on `count.set` / `count.peek` / `count.update`,
  which is `fixtures/signal-methods-in-handler.tsx` in full. `MemberMask::SIGNAL` exempts them only
  for `Prim::Signal` (`bind.rs:319-321`); `Prim::Computed` and `Prim::UseMemo` get
  `MemberMask::EMPTY` (`bind.rs:322-333`) yet `Computed<T>` declares `peek()`
  (`signals.ts:1143-1146`). So `useMemo(…).peek()` has no exemption data and is a false positive on a
  typed public API. The mask cannot simply be widened — `bind.rs:320-322` states masking a member a
  primitive lacks turns a tracked read into `Static`. **D1 needs its own per-Prim member allowlist,
  independent of `MemberMask`.**
- The rule must key on the **binding's** `SourceKind` being accessor-shaped, never on
  `React::Reactive`. `props.count * 2` is correct code — props lower to getters — and is a
  ⊤-reactive read on a `PropsParam`. A rule keyed on "a reactive read in a `BinaryExpression`" would
  fire on the most common correct pattern in the codebase.

**Accepted false negatives, recorded rather than papered over.** Cross-module: `import {count} from
'./barrel'` resolves to `Opaque` and compiles silently **(verified)** — P0 Bind is module-scoped.
Shadowing: a local `const count = 5` folds to a literal with no diagnostic **(verified)**. And
non-JSX files entirely: `analysis::bind` only runs when `source_type.is_jsx()` (`compile.rs:248-250`).
Do not reach for a name heuristic to cover any of these; that regex is the proximate cause of
`eslint-plugin-solid` #184/#190/#199.

**Silent-failure risk.** Diagnostic only. A `barq-ignore` must never influence codegen —
[react#34261](https://github.com/facebook/react) is the counterexample, where a disable comment made
the compiler bail out of optimising.

**No autofix, ever.** `exhaustive-deps`' autofix can introduce the bug it warns about, and codegen
only splices at recorded Sites so it could not autofix anyway.

**Value: high. Cost: medium.**

---

### 4.3 The `keyed={fn}` miscompile

**Complaint.** `bind::row_params` (`bind.rs:450-467`) computes `keyed` as "no attribute named `keyed`
whose value is the literal `false`", so a *function*-valued `keyed` takes the keyed arm and the row
parameter is classified `RowValue` → `React::Static` (`classify.rs:433-437`). But `For`'s runtime
hands the row through a **signal** when `keyed` is a function (`components.ts:255-269`).

**(verified)**:

```jsx
<For each={rows} keyed={(r) => r.id}>{(r) => <li>{r().text}</li>}</For>
// emits: _$insert(_el$2, r().text)        ← applied once, no thunk, no effect, warnings: []

<For each={rows} keyed={false}>{(r) => <li>{r().text}</li>}</For>
// emits: _$insert(_el$2, () => r().text)  ← correct
```

The SSR backend already models this correctly (`ssr.ts:519` computes
`typeof props.keyed === "function"`), so the two backends disagree.

**Proposal.** `bind.rs:450-467` grows a third case: `keyed` absent or literal `true` →
`[RowValue, accessor]`; literal `false` → `[accessor, Inert]`; anything else (function, or
unprovable) → `[accessor, accessor]`, matching `components.ts:260`. Then the docs page.

**Why this is ranked above everything below it.** `keyed={(i) => i.id}` is the shipped fix for Solid's
most viscerally reported complaint — the input that loses focus on every keystroke
([SO 72288357](https://stackoverflow.com/questions/72288357/solidjs-input-field-loses-focus-when-typing))
— and it is the community `<Key by>` component shipped in core. The map's proposal was "write it up,
zero engineering". **Documenting it before fixing this would drive users onto a path that silently
never updates.**

**Mechanism.** Compiler fix (classification), then docs.

**Verdicts.** Structural: found it, *correctness bug, outranks everything below the engine*.
Adversarial: independently confirmed the emitted output and that zero of the 111 fixtures mention
the feature.

**Silent-failure risk.** The status quo *is* the silent failure. The fix removes it. One knock-on:
the O3 note's gate depends on the same `keyed` predicate, so re-check it after — a function-keyed
`For` hands accessors and no longer has the O3 hazard at all.

**Value: high. Cost: small.**

---

### 4.4 Fix the kitchen-sink demo

**Complaint.** `packages/kitchen-sink/src/demos/SignalsDemo.tsx:74` is
`const fullName = `${firstName} ${lastName}`` over two `useState` accessors, which renders the string
`"() => s () => s"` into the DOM. `SignalsDemo.tsx:5-10` and `StoreDemo.tsx:5-7` still document the
deleted Babel plugin's transforms as present.

**Proposal.** Rewrite to `useMemo(() => …)`; delete the stale header bullets in SignalsDemo,
StoreDemo and ComponentsDemo; add the demo app to whatever asserts rendered output.

**Mechanism.** Docs / demo only.

**Verdicts.** Both reviewers: *feasible as described*. The adversarial review adds the point that
matters most: `kitchen-sink/src/barq.d.ts` sets `COMPILER_MODE: true`, so this is the **compiler-mode
shop window**, and no compiler mode has ever fixed this line. It is the clearest possible
demonstration that the type-level contract and the actual transform are not connected.

**Silent-failure risk.** n/a. The build never caught it because a stringified function is a valid
string.

**Value: high. Cost: small.** Ship it with D1 — the fixed demo is D1's negative fixture and the
broken one is its positive fixture.

---

### 4.5 `splitProps` / `mergeProps` / `merge` / `omit` — **the reviewers disagree, and it matters**

**Complaint.** All four flatten getters (§2). The map ranked this its single highest-value item:
"pure `packages/core`, no compiler change, cost: small", on the grounds that it is the one place
barq is measurably worse than Solid.

**The adversarial review falsified the value claim. (verified)**:

```jsx
function B(props) {
  const [l] = splitProps(props, ["class"]);
  return <button class={l.class} />;
}
// emits: _$setProp(_el$1, "class", l.class)   ← evaluated once at construction
```

`l` is `Opaque` — there is no `Prim` for `splitProps` in `bind.rs:318-345` — so the tuple destructure
of an unknown call yields `Opaque` and `shape.rs` emits the member read unwrapped. **A forwarding
getter is read once and the binding stays dead.** The `{...rest}` half is worse: it emits
`_$createElement("button", {...rest})`, an object-literal spread that re-flattens, and the `spread()`
runtime helper (`dom.ts:1005-1069`) that would keep it live is never emitted — the `Helper` enum
(`codegen/mod.rs:45-70`) has no entry for it and `fixtures/component-spread.tsx` asserts
`absent: ["spread("]`.

**Both arguments, stated fairly.**

- *For the map's ranking:* the uncompiled path is repaired by the runtime fix alone, and the
  uncompiled path is what the differential oracle judges. Solid's implementation is the reference and
  ours is strictly behind it. It is also the only item where a competitor is ahead of us on
  correctness rather than tooling.
- *For the adversarial demotion:* the compiled path is the path we tell people to use, and the
  runtime fix does not touch it. Shipping getters alone would produce a library that works
  uncompiled and is dead compiled — which is a *new* instance of §1.2, the worst pattern in this
  document.

**Revised proposal.** Runtime getters **plus** a compiler change: add `Prim::SplitProps` /
`MergeProps` / `Omit` to `tables.rs`, map them in `bind.rs:318-345` to
`Produced::tuple(PropsParam, PropsParam)` so member reads on the results are ⊤-reactive, then teach
`shape.rs` to thunk them. Decide separately whether codegen starts emitting `spread()` for rest
spreads or the rest half stays flat by design. Add fixtures — there are none.

**Silent-failure risk.** The runtime-only half removes a silent failure uncompiled and leaves one
compiled. The full change introduces a **new declared divergence**: uncompiled, props are already a
flat copy (`dom.ts:308-310`), so the compiled path goes live and the oracle does not. That needs a
`goesLive` declaration like the four O4 fixtures carry. One behavioural note either way: getters make
enumeration lazy, so `Object.keys(local).length` or `JSON.stringify(rest)` now triggers reads —
keep keys enumerable and own.

**Also note** the coupling nobody flagged: `mergeProps`' children-concat (`components.ts:1268-1285`)
and its `value !== undefined` precedence both require reading several sources' getters per access,
multiplying evaluations for any impure prop expression.

**Value: medium-high. Cost: medium-to-large, and it is not runtime-only.** The map's "high / small"
does not survive.

---

### 4.6 D3 — warn on props destructured in the parameter list

**Complaint.** §2. `function Chip({ text, tone })` flattens both, silently.

**Proposal.** Diagnostic scoped to the **parameter list only**, following `solid/no-destructure`,
which has zero false-positive issues in its tracker. Message must say "barq cannot make this
reactive", print the `props.x` rewrite as text, and stop — it must not imply the pattern is wrong,
because Vue and Svelte both moved props destructuring into the compiler and made it work.

**Mechanism.** Compiler diagnostic. `bind.rs:498-506` already returns `None` from `props_symbol` for
exactly this shape, with a comment explaining why; D3 is the branch where a JSX-returning,
tagged-or-exported function hit that path because of an `ObjectPattern`.

**Verdicts.** Structural: *feasible with changes* — guard on `ObjectPattern` specifically, not on
`props_symbol` returning `None`, which also covers arity ≠ 1 and rest parameters. Adversarial:
*feasible with changes*, and found a false positive sitting in our own corpus —
`fixtures/props-destructured-param.tsx` destructures `{ text, tone }` where `text: () => string` is an
**accessor** prop. Destructuring an accessor is correct and stays live; the fixture exists to pin
that. The compiler cannot tell the safe case from the unsafe one because `oxc_semantic` carries no
types.

Resolution: either accept the false positive and say so (`solid/no-destructure` accepts the same
class), or narrow the trigger to a destructured binding subsequently **read inside a JSX site**,
which analysis can see and which excludes accessor-forwarding in practice.

**Silent-failure risk.** Diagnostic: none. The rejected rewrite arm is in §5.2.

**Value: high. Cost: small.**

---

### 4.7 `StrictChild` — **the map wanted it wired up; the adversarial review says delete half of it**

**Complaint.** `StrictChild` is defined (`config.ts:135`), exported (`index.ts:88`) and referenced by
zero call sites. `Show`'s children are unconditionally `Child | ((item) => Child)`
(`components.ts:113-125`), so `config.ts:130-132`'s own documented example is false. `IsCompilerMode`
appears in exactly one prop type (`components.ts:517`). `Repeat.count: StrictAccessor<number> |
number` (`components.ts:472`) unions the raw type back in.

**The map's proposal.** Wire `StrictChild` into `ShowProps`, `SwitchProps`, `MatchProps`, `Loading`,
`Errored`; drop the `| number`.

**The adversarial objection, verified.** `StrictChild = IsCompilerMode extends true ? Child |
Accessor<Child> : Accessor<Child>` — the compiler-mode arm permits eager children. But
`shape.rs:305-318` states the compiler **deliberately never manufactures a thunk** for control-flow
children, and `fixtures/control-flow-show-eager-children.tsx` asserts
`absent: ["children: () =>", "fallback: () =>"]`. Compiled **(verified)**:

```js
Show({ when: u, children: (() => { const el = _tmpl$1();
                                   _$insert(el, () => u().name); return el })() })
// executing this throws: null is not an object (evaluating 'u().name')
```

So the `IsCompilerMode` arm type-blesses a crashing shape for precisely the audience that has the
compiler — including kitchen-sink. `config.ts:132`'s comment ("Compiler wraps children") describes
behaviour that does not exist. The same defect already ships at `components.ts:517`.

Two further gaps the map missed: `fallback?: JSXElement` (`components.ts:116`) is evaluated by the
same eager path and `StrictChild` does not cover it; and typing children unconditionally
`Accessor<Child>` breaks `control-flow-show-eager-children.tsx` and
`control-flow-show-eager-static-body.tsx` under `tsc --noEmit` (the compiler-rs tsconfig includes
`fixtures/**/*.tsx` with no `barq.d.ts`, so `COMPILER_MODE` is false there) **and** destroys
optimality target #8, a shipped optimisation those fixtures assert.

**Resolution.** Delete the `IsCompilerMode` arm from `StrictChild` and from `MatchProps.children` —
it promises laziness the compiler deliberately does not deliver. Then decide the real trade
separately: type children `Accessor<Child>` unconditionally and pay the corpus churn plus the loss of
target #8 for eager bodies, or keep the permissive type and put crash-on-null in docs with a runtime
dev note. Type `fallback` the same way whichever wins. The `Repeat.count` fix is correct and
independent.

**Mechanism.** Type-level.

**Silent-failure risk.** Types cannot produce wrong behaviour, but the map's version would make a
crashing shape *more* attractive by blessing it. That is the risk, and it is why the two halves must
not ship together.

**Value: medium (down from high). Cost: small for the deletion, medium for the real decision.**

---

### 4.8 Generate the compiler-mode declaration instead of letting the user assert it

**Complaint.** §1.2. `COMPILER_MODE` is a hand-written `declare global` with nothing checking it.

**Proposal.** The Vite plugin emits a generated `env.d.ts` (the `vite/client` / `.svelte-kit/ambient.d.ts`
pattern) containing the `declare global` block, and only when the transform is actually installed on
the JSX pipeline. Delete `kitchen-sink/src/barq.d.ts`. Pair with a dev-only runtime stamp so a file
that slipped past the include glob is detectable.

**Mechanism.** Type-level + build plumbing.

**Verdicts.** Structural: *feasible with changes* — the runtime stamp is a new emission in
`codegen/install.rs` gated on `options.dev`, not free, because nothing the compiler emits today
identifies a module as transformed. Adversarial: *feasible with changes*, with three problems the
proposal does not address:

1. A `declare global` is project-wide but the transform is per-file. A `.jsx` the include glob missed
   still gets relaxed types — **the exact hole the proposal exists to close.** The runtime stamp is
   therefore load-bearing, not a pairing nicety.
2. The file must exist before `tsc` runs. `.svelte-kit/ambient.d.ts` needs `svelte-kit sync` for
   precisely this reason; a cold checkout with no dev server would fail typecheck across a
   compiler-mode codebase. Ship a `barq sync` command.
3. `node_modules/.barq/env.d.ts` is not in any default tsconfig include. Emit to a project-relative
   path and document the include.

**And it must not ship before §4.7 resolves**, because generating the declaration makes an unsound
relaxation more reliable.

**Silent-failure risk.** The status quo *is* the silent failure: `<b>{count()}</b>`,
`{state.count}` and `<Badge count={total()}/>` all render correctly on the first frame and stop
updating if the transform did not run. Generating the declaration converts that into a type error at
every relaxed site.

**Value: high. Cost: medium.** Accept per-project rather than per-file granularity and say so.

---

### 4.9 Provider `value` — fix it in core, do not warn about it

**Complaint.** `<Ctx.Provider value={count()}>` freezes the subtree for every consumer.

**The map got the mechanism wrong and both reviewers caught it.** P4 emits
`get value() { return c() }` **(verified)** — the compiler does its job. The Provider reads
`props.value` exactly once into `owner._context` (`signals.ts:2282-2288`). There is nothing for a
compiler diagnostic to catch that a runtime fix would not remove.

**Proposal.** Store `() => props.value` in the Provider rather than its result. Oracle-safe: uncompiled,
`props.value` is already a flat copy, so this cannot regress the oracle; compiled, it makes the
binding live.

Separately, `useContext`'s unwrap test is `typeof stored === "function"` (`signals.ts:2360-2367`), so
a context whose value type *is* a function is misread — the Provider stores your `dispatch`, and
`useContext` hands it back as the accessor, so calling it invokes your callback with no arguments.

**On branding accessors to fix that:** both reviewers flagged it as wider than framed.
`isSignalGetter` is a bare `typeof value === "function"` (`type-utils.ts:29-31`) consulted at
`dom.ts:380, 480, 535, 595, 1042`, and it *must* keep accepting author-written arrows that carry no
brand — the `FunctionMaybe` contract depends on it. So branding cannot be generalised, and the
identical ambiguity in `applyProp` (a genuinely function-valued prop on a custom element gets
invoked, not passed) stays unfixable by this route. Say that rather than implying the brand is
general.

**Mechanism.** Runtime.

**Silent-failure risk.** Branding changes what `typeof stored === 'function'` accepted, so a user who
deliberately passed a raw thunk expecting accessor treatment gets the thunk. Ship with the typeof
fallback and a once-per-process dev warning when the fallback fires.

**Value: medium. Cost: small for the Provider fix; medium for branding.** Ship the Provider fix
first; it is the actual bug.

---

### 4.10 The remaining diagnostics, ranked and abbreviated

All are compiler diagnostics gated on §4.1. Each carries its verdict and its risk.

| Rule | Verdict | Note | Value / Cost |
| --- | --- | --- | --- |
| **BARQ005** — guard-clause return preceding another return | *feasible with changes* (both) | **Must live in `bind`, not `harvest`.** `harvest.rs:66-73` returns early the moment a return's argument is JSX and never walks the taken subtree, and tracks no function boundaries. Scope to functions `bind` identified as component origins via `tags`/`exported` (`bind.rs:132-133`) — **not** via `candidates`, which requires a props parameter and so misses `function App()` entirely, the commonest shape. No autofix. | medium / small |
| **BARQ007** — two or more `props.children` reads without `children()` | *feasible with changes* (both) | Verified: two reads, two subtree constructions. Fold the counter into the existing `visit_static_member_expression` (`bind.rs:609-616`) rather than adding a visitor, and **measure against `test/throughput.test.ts`** — this is the one rule with a real per-file cost, against a budget already recovering +5.7%. Worth documenting alongside: our `children()` is built on `computed` (`components.ts:1329-1335`), so it is lazy-pull and does **not** have Solid's evaluate-outside-the-Provider trap ([solid#2478](https://github.com/solidjs/solid/issues/2478)). | medium / small |
| **BARQ008** — event handler forwarded to a host element | **reviewers disagree** | Structural: *feasible as described*. Adversarial: *feasible but unwise* — `onClick={props.onClick}` is the standard forwarding idiom and is correct whenever the parent passes a stable handler, which is nearly always. The rule fires on every forwarding component and finds a real bug only when the parent's handler prop is itself reactive, **which is visible at the call site, not the definition site.** Retarget: warn when a JSX `on*` attribute's value is a getter-shaped reactive expression, which `shape.rs` already computes as `prop.getter`. That catches `<Button onClick={handlers[mode()]}/>` with near-zero false positives. **Adopt the adversarial version.** | low→medium / small |
| **O3 For-origin note** — keep at note level, give it a code, a frame, a docs page | *feasible as described* (both) | The gate at `shape.rs:273-284` is right, and gating on `Opaque` instead stayed silent for the demonstrable `each={store.items}` case. `ROADMAP.md:343-347` declines to promote it and that is correct. Re-check the gate after §4.3 — a function-keyed `For` no longer has the hazard. | medium / small |
| **BARQ009** — `value`/`checked` bound with no sibling writer | *feasible with changes* (both) | Note level or not at all. False positives: a read-only display input, a `ref`-driven input, and a writer installed on an ancestor via delegation (`dom.ts:350-352`) all look identical. **Ship the nullish normalisation independently** — it needs no engine and has no downside. Correction to the map: the fix site is inside the `DOM_PROPS` arm of `setElementAttr` (`dom.ts:643-656`), which takes the property branch *before* the isNullish check at `:669`; and it must write `""`, not `removeAttribute`, because removing the attribute does not clear a dirty input. Only `undefined` is affected. | medium / small |
| **BARQ010** — camelCased style keys, `onChange` on a text input | *feasible as described* (both) | The loud members of this family are already handled — `className` normalises at `lower/names.rs:8` with round-trip tests at `compile.rs:1008-1017`. The style half can only fire on an inline object *literal*, so it will miss most real occurrences. Do not autofix `onChange` → `onInput`. | low / small |

---

### 4.11 Runtime and type-level items, ranked and abbreviated

| Item | Mechanism | Verdict | Silent-failure risk | Value / Cost |
| --- | --- | --- | --- | --- |
| Default `DEV.diagnostics` on in dev with a console sink | runtime | *feasible as described* (both) | None. **Independent of the engine — do not sequence behind M8a.** | high / small |
| Fix the router `Link` bug (`router.tsx:1403-1406`) | app code | *feasible as described* (both) | n/a | high / small |
| Dev note when a setter receives a `===` object/array | runtime | *feasible as described* (both). One branch inside the existing equality check at `signals.ts:1215-1219`; `update` routes through the same `write` at `:1231`. Correctly argues against defaulting `equals: false` — the Solid workgroup's own note is that a downstream memo you do not control blocks propagation anyway ([solid#2462](https://github.com/solidjs/solid/issues/2462)). | Fires on a legitimate deliberate no-op write. Note level, suppressible. | medium / small |
| `useState` returns the live `Signal` so `.peek`/`.set` survive | runtime **+ compiler** | *feasible with changes* (both) | **Not runtime-only.** `bind.rs:333` maps `Prim::UseState` to `MemberMask::EMPTY` while `Prim::Signal` gets `MemberMask::SIGNAL`, and `bind.rs:320-322` warns that masking a member a primitive lacks turns a tracked read into `Static`. Both lines in one commit, plus a `.peek`/`.set` case in `fixtures/use-state-tuple.tsx`, which currently tests neither. | medium / small |
| Export `narrow()` / `isDef()`; document the callback form as the narrowing idiom | type-level | *feasible as described* (both) | None. State explicitly that the callback **body** is not itself a tracking scope — [solid#2324](https://github.com/solidjs/solid/issues/2324) is the cautionary case. Nobody upstream shipped these; the maintainer's stated plan is to petition TypeScript for idempotent-function annotations. | medium / small |
| Refuse `Map`/`Set`/class instances in `Store<T>` | type-level | *feasible with changes* (both) | **Fix `DeepReadonly`'s function case first** — it maps function-typed members to `{}` (`store.ts:17`), so Map methods are already uncallable and a refusal layered on top produces confusing errors. Solid 2.0 added Map/Set proxying and immediately produced its own bug class (#2952), which argues for the type refusal over the runtime feature. Ship a `Raw<T>` opt-out. | medium / medium |
| Retype `unwrap` to launder `DeepReadonly` | type-level | **The map's signature does not work.** Adversarial ran it: `<T>(proxy: DeepReadonly<T> \| T): T` infers `T` from the naked branch and produces a byte-identical error. Put a `Mutable<T>` mapped type on the **return**. And decide the honesty question: the body returns the live raw target, so laundering hands out a mutable alias that bypasses the setter proxy. | Laundering without cloning bypasses the proxy trap silently. | medium / small |
| Store setter overloads past depth 4 | type-level | *feasible as described* (both) | Types only. `storePath` (`store.ts:733`) already exists and is undocumented; the docs pointer is probably the whole fix. | low / medium |
| `renderBranch` primitive; demote the four marker exports to internal | runtime | *feasible with changes* (both) | **`Show` registers its `onCleanup` inside the renderEffect body (`components.ts:154-160`)**, so it re-registers per run and disposal ordering depends on that placement. Extract verbatim. Gate on the 1216-assertion harness. `P5 anchor` is the last pass that may change skeleton shape, so a change to how many markers a control-flow component creates interacts with marker elision (target #9). The router must migrate first. | low / medium |
| Pick one async system and mark the other legacy | docs | *feasible as described* (both) | Deferring is the expensive option. Lead with the `createAsync` `key` / SSR-hydration-seeding tiebreaker. Flag that eight flows including `Loading`/`Errored`/`Suspense`/`Await` are non-string-inlinable (`symbols.rs:186-191`), so either system falls back to the DOM backend under SSR. | medium / small |
| One naming convention per concept in the docs | docs | *feasible as described* | `createSignal`, `createMemo`, `createEffect`, `createStore`, `createResource` appear zero times in `index.ts` — a Solid developer arrives and can name nothing. Nothing needs removing; state the mapping. | medium / small |
| Document `keyed={fn}`, `ref` arrays, `href={accessor}`, `flush(fn)`, `storePath` | docs | *feasible as described* | Each is a shipped capability with no docs and, for three of them, no fixture. | medium / small |
| In-page diagnostics panel over a custom HMR event | runtime/tooling | *feasible with changes* (both) | **Ship with spans and codes only.** `Skeleton::origin` is **not** component labels — it is `(html byte offset, JSX span)` for sourcemap segments (`skeleton.rs:52-54`), and `Module::spans` is NodeId → span. No component identity exists anywhere in the IR, so "a panel with component labels" needs a new IR field populated in `bind` and threaded to codegen. Keep the graph inspector and profiler out of M8. Gate on the dev flag so panel code cannot reach production. | medium / large |

---

## 5. What we should not do

A roadmap with no rejections is not a roadmap. Each of these looked attractive and each has a
counterexample.

### 5.1 `/*@once*/` — the premise does not exist

The proposal was to support a `/*@once*/` marker suppressing the getter on a JSX attribute, because
`<B p={Math.random()} />` supposedly emits `{ get p() { return Math.random() } }` and re-executes on
every read
([Lipatov](https://vladislav-lipatov.medium.com/solidjs-pain-points-and-pitfalls-a693f62fcb4c)).

That is Solid's behaviour, not ours. **(verified)**:

```js
<B p={genId()} />          →  B({ p: genId() })          // plain value
<B p={c() + genId()} />    →  B({ p: c() + genId() })    // still plain
```

`shape.rs:322-333` emits a getter **only** for an expression the analysis proved `React::Reactive`,
and its comment states the policy: *"Opaque stays a plain value: the un-compiled path evaluates it
once, so a prop carrying a side effect has to fire exactly once here too."*

So the marker would serve no case while carrying exactly the failure this project must not ship: a
user-written comment that makes a reactive prop inert, correct on the first frame, frozen after, with
no diagnostic possible because the compiler was *told* to do it.

If a residual getter-over-impure-expression case is ever found, the honest response is a compiler
**note** on a getter-shaped expression containing an unresolvable call — not a marker the compiler
must obey against its own analysis.

### 5.2 A Vue-style props-destructure rewrite

Vue's precedent (§3) makes this look defensible: it is stable and on-by-default in 3.5, the boundary
is clear, and it ships a compile error for the unsafe case. Mechanically it is possible here too —
`codegen::emit` is a `VisitMut` over the whole Program (`codegen/mod.rs:150, 321-381`) and already
rewrites nodes it did not harvest, and every node the compiler builds carries the original span, so
sourcemaps are not the blocker. "Codegen splices only at recorded Sites" is an IR contract, not a
physical limit: `Site` (`ir/module.rs:56-61`) has four variants and nothing prevents a fifth.

The barq-specific reason to refuse is stronger than Vue's, and it is in our own corpus.
`fixtures/props-destructured-param.tsx`, `props-destructured-body.tsx` and `props-rest-spread.tsx`
**pin the flattening as correct in both paths**, the last one stating it outright: *"this is the one
props shape where fine-grained flow across the boundary cannot survive at all, and the two paths have
to agree about that."*

Compare O4, the divergence that *is* defensible: `auto-thunked-read.tsx` declares it per-hole via
`goesLive` with three named holes and a `wins` entry stating the expected compiled DOM. It is
confined to a bare read inside a JSX hole, where the harness has a vocabulary to declare it.

A props-destructure rewrite relocates divergence **out of JSX holes and into arbitrary component
bodies**, where the harness has no per-hole vocabulary at all. So we have no reason to expect a
different outcome from Vue's, and we have one reason Vue did not have: **the differential oracle is
the only mechanism protecting us from repeating the mistake, and this is the one change that would
blind it.**

If it is ever revisited: the compile-error arm must be designed before the transform, a fifth `Site`
kind and an IR carrier for identifier-level rewrites are required, and the harness needs a way to
declare body-level divergence before the first fixture can be written.

### 5.3 Implicit accessor calls, in any form, at any scope

Settled by §3. Vue ran it in production for two years across large codebases and removed it for
reasons that survive any implementation. Our pipeline forbidding it is a constraint that happens to
agree with the only large-scale experiment ever run. `ROADMAP.md:872-884` already says this.

### 5.4 A test-mode auto-flush entry point — already shipped

The proposal was to ship `@barqjs/core/testing` whose `fireEvent` auto-flushes, the trick RTL plays
with `act()`. It exists: `packages/testing/src/index.ts:241-256` exports a flush-wrapping `fireEvent`
with the wrapper applied per-key at `:252-255`, and an `act()` at `:228-236` that flushes (and
awaits, then flushes, for the async form).

The cited evidence does not support the proposal either: the 27/27/33/48 `flush()` calls are in
`packages/core`'s own primitive unit tests, which exercise signals/graph/dom directly with no DOM
event to wrap, and would keep every one of those calls after the change.

Reduce to docs: point the `effect()` and `flush()` docstrings at `@barqjs/testing` and at the
`flush(fn)` callback form (`signals.ts:1127-1130`). Both are genuinely undiscoverable; neither needs
code.

### 5.5 Wiring `StrictChild`'s `IsCompilerMode` arm

§4.7. It type-blesses a shape that throws, for exactly the audience that has the compiler. Delete the
arm; do not wire it.

### 5.6 Extending η-reduction to host-element props

The proposal was to extend η-reduction beyond the five whitelisted flow props so
`class={() => cls()}` emits `class: cls`. Two verdicts against, from different angles.

Adversarial: **what it saves is one closure per element and nothing else** — `setProp(el,'href',() =>
cls())` and `setProp(el,'href',cls)` both end in the same `renderEffect` inside `applyProp`, so there
is no tracking difference. Against that, `ref` goes through `setProp` too, and `applyProp`'s ref
branch (`dom.ts:359-376`) **calls** the value with the element, so η-reducing a ref thunk whose
callee is accessor-classified turns a ref into a silent no-op.

Structural: the framing as "type-directed from the `FunctionMaybe` contract" is not implementable —
the compiler has no type information at all. The only correct driver is the generated attribute
tables, which is a whitelist, which is what the proposal wanted to escape.

**Do the documentation half instead.** `href={resolvedHref}` and `class={cls}` already typecheck,
already work in both paths, and already avoid the closure **(verified)**. The router not doing it
(`router.tsx:1433, 1504-1505`) is proof the affordance is undiscoverable, and that is worth more than
the compiler work.

### 5.7 A static "read outside a reactive context" rule

`ROADMAP.md:302-315` argues the static version is what produced ~25 open false-positive reports
against `solid/reactivity`, and that a MobX-style `observableRequiresReaction` must default off
because reading outside a reactive context is legitimate. Both hold. There is also a hard structural
reason: `analysis/mod.rs:19-25` documents choosing `SemanticBuilder::new()` specifically **over**
`new_linter()` because the latter builds the control-flow graph. A flow-sensitive rule is not a rule
addition — it is switching semantic construction mode on every file compiled, against a throughput
budget already recovering +5.7%.

Same reasoning kills the compile-time "reactive read after the first `await`" rule. The runtime
already observes that class directly and more accurately.

### 5.8 Auto-`untrack` around outbound callback invocations

Dependency tracking is transitive through calls into modules P0 Bind cannot follow — `Binder::imports`
matches on the literal module specifier (`bind.rs:140-146`) and anything else answers `Opaque`
**(verified via the barrel-import probe)**. A static rule would have to assume every outbound call
reads signals, which is both true and useless. And an automatic `untrack` would be exactly the wrong
magic: it silently drops dependencies the author intended. Documented convention plus, at most, a
runtime dev counter for an effect whose dependency set grew after its first run.

---

## 6. Recommended sequence

### M8a — the engine and the rules that need nothing else

1. **Diagnostics engine** (§4.1). Codes, three severities, spans surviving napi, `this.warn(…,
   position)`, `barq-ignore-next-line CODE (reason)`, project severity map, line index.
2. **`keyed={fn}` classification fix** (§4.3). Correctness bug, silent wrong output, blocks a free
   documentation win. Ship the docs page and a fixture in the same change.
3. **D0** — reactive value dropped at a stateful-diff prop (§4.2). Zero-heuristic, one branch,
   structurally zero false positives.
4. **D1** — accessor in a coercion position (§4.2), with the per-Prim member allowlist and the
   binding-keyed trigger.
5. **D3** — props destructured in the parameter list (§4.6), trigger narrowed to bindings read inside
   a JSX site.
6. **Kitchen-sink fix** (§4.4), shipped alongside D1 as its fixture pair.

### M8b — runtime diagnostics, which do not need the engine at all

Sequence these *first* if the engine slips; they are independent.

1. Default `DEV.diagnostics` on in dev with a console sink (`signals.ts:120`) — one line.
2. The `===`-object write note (§4.11).
3. Fix the router `Link` bug (§4.11).
4. `value={undefined}` nullish normalisation (§4.10) — no engine needed, no downside.

### Alongside M8 — core and type-level work with no compiler coupling

- Provider stores `() => props.value` (§4.9).
- Delete `StrictChild`'s `IsCompilerMode` arm and `MatchProps`' (§4.7); fix `Repeat.count`.
- `unwrap` return-type laundering plus the `DeepReadonly` function-member fix (§4.11).
- Export `narrow()` / `isDef()` (§4.11).
- Documentation sweep: `keyed={fn}`, `ref` arrays, `href={accessor}`, `flush(fn)`,
  `@barqjs/testing`, `storePath`, the naming mapping, the async-system decision.

### Needs its own decision before it can be scheduled

- **`splitProps` and friends** (§4.5). The runtime-only version does not repair the compiled path.
  The full version needs `Prim` classification, a decision on `spread()`, fixtures, and a declared
  `goesLive` divergence. Decide the scope before committing it to a milestone.
- **`StrictChild`'s real trade** (§4.7): unconditional `Accessor<Child>` at the cost of corpus churn
  and target #8, versus permissive types plus a runtime dev note.

### M9 — HMR

The generated compiler-mode declaration (§4.8) and the runtime transform stamp belong here rather
than M8, because both are build-plumbing changes that touch the same plugin surface as HMR, and the
stamp is a codegen emission gated on `options.dev`. Worth stating explicitly in M9's framing: HMR is
a named, unresolved Solid pain (`solid-refresh` #15 and #33 are both "contexts become undefined
during HMR"), and Ryan Carniato's own answer is that fixing it properly requires reactive-graph
serialization first
([discussions/2425](https://github.com/solidjs/solid/discussions/2425)). A from-scratch compiler with
a Site-based splice model may have a structural advantage there; that claim has not been tested and
should not be made until it is.

### Fits no milestone

- **The in-page diagnostics panel** (§4.11) shares its transport with the engine but is a tooling
  project, not a compiler one. Ship it with spans and codes only; component labels need a new IR
  field.
- **The graph inspector and profiler.** Scope as their own project. The devtools gap is the
  most-cited non-reactivity complaint from someone running a fine-grained framework in production
  ([HN 43734911](https://news.ycombinator.com/item?id=43734911)) and Solid's own devtools README says
  "in early development", so there is room — but it is not M8 work and must not be smuggled in.
- **`renderBranch`** (§4.11). Gated on the differential harness, and the router has to migrate first.

---

## 7. Where the research is thin

Stated rather than padded.

- **Reddit and Discord are unread.** Both are hard-blocked for the tooling used. `r/solidjs` and the
  Solid Discord are certainly the highest-density source of "what beginners actually hit", and
  several GitHub threads reference Discord conversations that could not be retrieved. The frequency
  calibration in the Solid survey is therefore biased toward people who file issues.
- **Nobody measured how often O4's divergence actually bites.** The fixture corpus is written
  entirely in the *safe* idiom — 80 of 111 fixtures, 153 `{() =>` occurrences — precisely because it
  is judged against the uncompiled oracle. So the ergonomic idiom the compiler exists to enable has
  almost no test coverage, and we have no data on how many real-world holes the divergence affects.
- **Whether the destructuring complaint decays with experience is unresolved.** One report says it
  evaporates after a few months ([solid#2151](https://github.com/solidjs/solid/issues/2151)); another
  says it never does, because team composition churns and each new hire re-pays the cost
  ([#2425](https://github.com/solidjs/solid/discussions/2425)). Both are single data points. If we
  are optimising for team adoption rather than individual adoption, the second argument is the one
  that matters, and it argues for diagnostics over documentation.
- **Why people who dropped Solid dropped it is not in any published cut.** State of JS gives it the
  highest satisfaction score five years running at ~10% usage; the freeform "why did you stop using
  X" data exists in the raw dumps and was not reachable.
- **The `class`/`style` finding (§1.2, §4.2) is one session old.** It was verified by compilation and
  traced to `classify.rs:118`, but it was not in any of the four research inputs, so it has had no
  adversarial pass. Treat the D0 proposal as provisional until it does.
- **No proposal here covers the router `Link` bug.** That is stated in §2 and is worth repeating as a
  limit on the whole strategy: the single most convincing piece of evidence that discipline fails is
  invisible to every rule we are proposing to build.
