# Props as values: changed assertions in packages/compiler

Every expectation changed while restating the compiler's tests in value style.
Inputs that were only respelled (`props.x()` to `props.x`) with their expectation
left as written are listed at the end, by file, because they change no assertion.

## Rust tests (`src/**`)

### src/analysis/boundary.rs

- `SCENE` (shared by `a_named_import_is_a_boundary_and_its_children_build_through_its_renderer`
  and `the_server_renders_the_boundary_and_drops_a_custom_renderers_children`):
  input only, `p.title()`, `p.at()`, `p.label()`, `p.on()` respelled as reads. No
  expectation changed: every expected string holds for the value-style input,
  including `() => p.on() ? 1 : 0`, because `when={p.on}` on `<Show>` is a forward.

### src/codegen/ssr.rs

- `a_proven_string_writes_its_attribute_name_into_the_template`: 4 expectations,
  `p.id()` / `p.n()` / `p.on()` to `_$readProp(p.id)` / `_$readProp(p.n)` /
  `_$readProp(p.on)` inside the same `_$escAttr(...)` strings. Why: a read is now
  emitted as `_$readProp`. The `kept` and `dirty` inputs of the same test were
  respelled too; their expectations are unchanged.

### src/codegen/universal.rs

- `every_channel_and_event_is_one_set_prop_under_the_authors_name`: 3 expectations.
  Old `_$setProp(_el$1, "onClick", p.go);`, `..."onKeyDownCapture", p.key);`,
  `..."ref", p.r);`. New `_$setProp(_el$1, "onClick", _$readProp(p.go));`,
  `..."onKeyDownCapture", _$readProp(p.key));`, `..."ref", _$readProp(p.r));`.
  Why: a prop on a host element's handler or ref channel is a read; the input was
  already value style.

### src/compile.rs

- `a_route_option_written_inline_is_compiled_as_a_component`: input
  `error().message` to `error.message` (twice). Old expectations
  `notFoundComponent: ({ error }) => {` and `errorComponent: function Boom({ error }) {`.
  New `notFoundComponent: (_props$1) => {` and `errorComponent: function Boom(_props$2) {`.
  Why: a destructured parameter becomes the one record `_props$N`. The doc
  comment's "its parameter list stays the props the author wrote" was corrected
  to say the list is the one record the pattern became.
- `an_ordinary_event_is_unchanged_by_capture_support`: old
  `contains("__bq_click")`. New two exact lines,
  `_$bindEvent(_el$1, "click", _$readProp(props.onClick));` and
  `_$bindEvent(_el$1, "focus", _$readProp(props.onFocus));`. The
  `!contains(", true)")` assertion is unchanged. Why: `onClick={props.onClick}`
  is now a read whose value the compiler cannot see, so the binding goes through
  `bindEvent` (which delegates at run time) and the expando write is no longer in
  the emitted text. The old compiler wrote the Cell itself into the expando.
- `a_capture_free_handler_hoists_and_a_capturing_one_does_not`: old needle
  `bump(n)`. New `bump(_$values(n))`. Why: `V`'s parameter `n` is its props, and
  props used whole become `_$values(n)`. The position check is unchanged.
- `an_event_value_the_compiler_cannot_see_stays_with_the_runtime`: old
  `_$bindEvent(_el$1, "click", p.h)`. New `_$bindEvent(_el$1, "click", _$readProp(p.h))`.
  Why: a read.
- `a_bound_handler_tuple_is_written_whole_into_the_expando`: old
  `_el$1.__bq_click = [remove, item]`. New `_el$1.__bq_click = [remove, _$values(item)]`.
  Why: `V`'s parameter `item` is its props, used whole.
- Inputs only, expectations unchanged: the `Dynamic` test at the `Card`/`App`
  source (`p.label()`, `p.on()`), the `classList` test (`p.on()`), the
  directive-prefix test (`p.on()`), the two `<For each={() => props.rows()}>`
  tests, and the `<Show when={p.on()}>` test.

### src/passes/shape.rs

- `a_function_prop_is_a_cell_carrying_one_evaluation`: old
  `onClick: _$cell((e) => go(e, props.id))`. New
  `onClick: _$cell((e) => go(e, _$readProp(props.id)))`. Why: a read.
- `a_props_read_is_live_inside_and_forwards_by_identity_out`: input
  `{props.total()}` to `{props.total}`; expectations unchanged. The doc comment's
  paragraph about C4's `props.total()` spelling and the two spellings converging
  was corrected: there is one spelling now.
- `a_function_never_crosses_a_handler_channel_as_the_cell`: old
  `onClick: props.onClick`. New `onClick: () => _$readProp(props.onClick)`. Why:
  a prop on a component tag's handler channel is read, not forwarded, so what
  crosses is a Cell of the read. The inline comment that said the channel "must
  not re-wrap it" was corrected to say this. Flagged in the report: this is an
  assertion about the old forwarding rule, restated to the new one.

### src/analysis/boundary.rs, src/codegen/universal.rs (inputs only)

- `p.at()`, `p.title()`, `p.on()`, `p.rows()`, `p.label()`, `p.text()`,
  `p.a()`, `p.b()` respelled as reads in tests that were passing. No expectation
  changed.

### src/props_sugar.rs

- New `mod tests`, 14 tests. Nothing existing changed.

## Bun tests (`test/**`), fixtures and snapshots

### fixtures (inputs)

- `component-boundary-props.tsx`, `component-spread.tsx`,
  `component-function-props.tsx`, `component-forwarded-handler-tuple.tsx`,
  `semantics/sem-reveal-nested-group.tsx`, `semantics/sem-calling-convention.tsx`:
  `props.x()` to `props.x`, as the pass's own codemod writes them.
- `props.cb === props.cb` and `props.render === props.render` (identity of the
  carrier, not of the value) became `cells(props).cb === cells(props).cb` and
  `cells(props).render === cells(props).render`, with `cells` imported. Same
  comparison as before, same emitted text.
- `sem-calling-convention.tsx`: `props.carrier === undefined` became
  `cells(props).carrier === undefined`, because a value-style read there would
  call the counting Cell and the claim `forwarding-through-three-wrappers-reads-nothing`
  counts reads. `merge(others, { keep: props.keep })` became
  `merge(cells(others), { keep: cells(props).keep })`. Prop types became value
  types and the four call sites pass values (`text="label"`, `items={[1, 2]}`,
  `carrier={counting()}`, `keep="kept"`, `drop="dropped"`) so the fixture still
  typechecks. The failure message's quoted source was updated to `props.text`.
- `fixtures/tsconfig.json`: the comment naming `props.tone()` was corrected; the
  exclude list is unchanged.
- `component-spread.tsx`: the comment "`props.tone()` throws" was corrected.

### fixture `optimality` declarations

- `component-boundary-props.tsx`: `emits` needle `"() => props.name()"` to
  `"readProp(props.name)"`. A declaration may not name a compiler uid
  (`no declaration names a compiler-generated identifier`), so the exact shape
  `() => _$readProp(props.name)` is asserted in `test/optimality.test.ts`
  instead (new test `component-boundary-props: a prop read in a hole is a thunk
  around the read`).
- `component-forwarded-handler-tuple.tsx`: `emits` needle
  `"cb: () => [props.handler(), props.label()]"` to the two needles
  `"readProp(props.handler)"` and `"readProp(props.label)"`, with the exact
  `cb: () => [_$readProp(props.handler), _$readProp(props.label)]` asserted in
  `test/optimality.test.ts` (new test `component-forwarded-handler-tuple: an
  array prop is one Cell over both reads`).

### test/__snapshots__/roundtrip.test.ts.snap (10 entries)

- `component-boundary-props`, `component-forwarded-handler-tuple`,
  `component-function-props`, `component-spread`, `props-raw-forward`,
  `ref-on-component`: `props.x()` to `_$readProp(props.x)` in each read, plus the
  `readProp` import. A single live attribute is now
  `_$bindProp(el, _$setAttr, name, () => _$readProp(props.x))` where it was a
  `_$bindEffect(() => props.x(), ...)` block. In `component-spread` the fused
  effect's fields read `_$readOpaque(_$readProp(props.tone), "data-tone")`.
- `props-destructured-param`: `function Chip({ text, tone })` to
  `function Chip(_props$1)`, `tone` to `() => _$readProp(_props$1.tone)`,
  `text` to `_props$1.text` (child forward).
- `props-destructured-body`: `const { text, tone } = props;` to
  `const _unused$1 = void 0;` with the same reads on `props`.
- `props-renamed-and-defaulted`: the pattern to
  `const _prop$1 = _$withDefault(props, "tone", () => { return "warm"; });`,
  read as `() => _prop$1()`; `body` to `props.text`.
- `props-rest-spread`: the pattern to `const rest = _$omit(props, "text");`.
- The snapshots also carry the fixture's own text, so the edited comments and
  `emits` needles above appear in them.

### test/__snapshots__/oracle.test.ts.snap (1 entry)

- `rendered DOM golden ref-on-component: rendered DOM`: step 0 gains
  `data-component-ref="boxed"` on the component's span, and its attribute line
  becomes `class,data-component-ref`. Why: `<span ref={props.ref}>` used to hand
  the Cell to the ref channel, which called it as a ref function and wrote
  nothing; it now reads the `{ current }` object the caller passed, so the ref
  resolves and the fixture's own step sets the attribute. Flagged in the report:
  this is a rendered-output change, not a respelling.

### test/__snapshots__/effect-counts.test.ts.snap (1 entry)

- `props-renamed-and-defaulted`: `created: 3, runs: 4` to `created: 4, runs: 5`.
  Why: `tone = "warm"` used to be the plain string for the chip that omits the
  prop, so its attribute was written once; the default is now a Cell
  (`_$withDefault`), so that chip's attribute is a live binding too.

### test/component-through-cast.test.ts

- Input `props.data()?.title` / `props.label()` to `props.data?.title` /
  `props.label`.
- 6 tests `is lowered as a component: ...`: old
  `not.toMatch(/_\$insert\([^,]+, props\.data\(\)/)`. New
  `not.toMatch(/_\$insert\([^,]+, _\$readProp\(props\.data\)/)`. Why: the eager
  form of the read is now spelled `_$readProp(props.data)`. The other two
  assertions are unchanged and pass.
- `but a local function nothing references is still not one`: expectation NOT
  changed, test left failing. See the report.

### test/roundtrip.test.ts

- `a component named only as an object property is compiled as one`: inputs
  `{props.x()}` to `{props.x}` in both halves. First half's expectation
  unchanged and passing. Second half's expectation
  (`_$insert(_el$1, () => props.x())`) NOT changed, test left failing. See the
  report.

### test/optimality.test.ts

- Two tests added (above). Nothing existing changed.

### test/diagnostics.test.ts

- `every advertised code is reachable from some input`: entries added for
  BARQ030 and BARQ031. Nothing existing changed; the test is left failing on
  BARQ005. See the report.

### docs (examples the docs-pages test runs)

- `docs/BARQ015.md`, `BARQ025.md`, `BARQ027.md`, `BARQ028.md`: fenced examples
  respelled (`props.background()`, `props.editing()`, `props.value()`,
  `props.level()`, `props.text()`, `props.label()` to reads). Their tests pass
  unchanged.
- `docs/BARQ018.md`: second failing example and second fixed example respelled
  (`props.online()` to `props.online`). The page's test is left failing: the
  value-style example no longer raises BARQ018. See the report.

## Inputs respelled with no expectation changed

`test/async-key-hydration.test.ts`, `test/hydration-api.test.ts`,
`test/frames.test.ts`, `test/frames-live.test.ts`, `test/frames-router.test.ts`,
`test/frames-flight.test.ts`, `test/unique-id-hydration.test.ts`,
`test/row-owner.test.ts`, `test/mathml-namespace.test.ts`,
`test/browser-mathml-check.ts`, `test/stream-early-hydration.test.ts`,
`test/children-order.test.ts`, `test/component-spread.test.ts` (also its `Row`
prop types, to value types), `test/hydration-mutations.test.ts`.

`test/frames-bind.test.ts`: `props.filters()` to `props.filters`, and
`props.row({ ... })` to `cells(props).row({ ... })` with `cells` imported. The
frame hands `row` over as a function that takes arguments; a value-style read
would call it with none first.

## Left failing on purpose (no assertion changed)

- `test/diagnostics.test.ts`: `every advertised code is reachable from some input`
  (BARQ005), docs pages BARQ005, BARQ010, BARQ018, BARQ031.
- `test/roundtrip.test.ts`: `a component named only as an object property is
  compiled as one` (second half).
- `test/component-through-cast.test.ts`: `but a local function nothing
  references is still not one`.
- `test/loader.test.ts`: both tests, on the temporary `migrateProps` entry.

## After the agents: analysis and spread changes

- `packages/compiler/src/props_sugar.rs`, `a_read_becomes_read_prop` and `a_default_export_and_an_inline_route_option_are_components` (three expectations): `_$bindProp(_el$1, _$setAttr, "title", () => _$readProp(props.title));` became the `_$bindEffect(() => _$readProp(props.title), …)` form. Analysis now knows `_$readProp(props.x)` is a read of the prop, so the attribute is a proven reactive binding instead of an opaque one.
- `packages/compiler/src/passes/shape.rs`, `a_spread_becomes_a_source_list_in_written_order`: `_$props([a,{b:()=>x()},c])` became `_$props([_$carry(a),{b:()=>x()},_$carry(c)])`. An object spread onto a component is an object of values, carried as Cells.
- `packages/compiler/src/passes/shape.rs`, `a_component_spread_that_reads_is_a_source_function`: `_$props([rest])`, `_$props([() => wide() ? bag : null])`, `_$props([bag, props])` became `_$props([() => _$carry(rest())])`, `_$props([() => _$carry(wide() ? bag : null)])`, `_$props([_$carry(bag), props])`. Same reason; `props` is a record and stays as it is.
- `packages/compiler/src/compile.rs`, `a_component_is_called_and_a_fragment_is_an_array` (two expectations): `_$props([rest, {` became `_$props([_$carry(rest), {`.
- `packages/compiler/src/analysis/boundary.rs`, `a_named_import_is_a_boundary_and_its_children_build_through_its_renderer`: `() => p.on() ? 1 : 0` became `() => _$readProp(p.on) ? 1 : 0`. A prop handed to a lowered construct (`<Show when={p.on}>`) is read, not called, so a prop the caller left out no longer throws.
- `packages/router/src/catch.test.ts:128`: the uncompiled error component reads `props.reset()` instead of `props.reset`. The router now passes `reset` as a Cell like every other prop; the assertion is unchanged.
