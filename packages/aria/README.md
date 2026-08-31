# @barqjs/aria

Accessible interactions, state and headless components for [barq](https://github.com/salamaashoush/barq). Studied from `adobe/react-spectrum` and rewritten for a framework whose components run once and whose props are Cells.

```bash
bun add @barqjs/aria
```

```tsx
import { Button, ListBox, Option } from "@barqjs/aria";
import { signal } from "@barqjs/core";

const picked = signal<Set<string>>(new Set());
const fruits = [
  { id: "apple", name: "Apple" },
  { id: "banana", name: "Banana" },
];

<ListBox
  label="Fruit"
  items={fruits}
  selectionMode="multiple"
  onSelectionChange={(keys) => picked.set(keys as Set<string>)}
>
  {(fruit) => <Option>{fruit.name}</Option>}
</ListBox>;
```

Two layers ship, and either can be used on its own. `listBox()` and `option()` are hooks that return props for elements you write yourself; `<ListBox>` and `<Option>` are components that call them. Nothing is styled: every component renders the minimum markup its role needs, and everything visual is yours.

Each module is an entry point as well as being re-exported from the root, so `@barqjs/aria/listbox` and a tree-shaken import from `@barqjs/aria` cost the same.

## Names carry no `use` prefix

`press()`, `focusRing()`, `button()`, `listBox()`. A component here runs once and there is no rules-of-hooks to signal, so the prefix would be a lie about when the function may be called.

## Collections are data

react-aria builds a collection by rendering the children and collecting what they declare. This package takes `items` plus a render function:

```tsx
<Menu items={actions()} onAction={(key) => run(key)}>
  {(action) => <MenuItem>{action.name}</MenuItem>}
</Menu>
```

A framework whose components run once and whose children are lazy Blocks does not need the two-pass dance. `<Menu>` builds the collection from `items`, renders `<For>` over the nodes, and installs the node on each row's context so `<MenuItem>` reads its key, value and disabled state from there. Static items are an array literal.

An item with `children` becomes a **section**. That is the one thing to know before nesting anything: a submenu's items go under a different key, because `children` already means "the items of a section".

## Props are Cells

Inside a component a prop is an accessor. A JSX call site passes a value and the compiler wraps it:

```tsx
<Checkbox isDisabled={disabled()} />   // right
<Checkbox isDisabled={() => disabled()} />  // a Cell of a Cell, and wrong
```

A hook takes `MaybeAccessor<T>` for every value option, so `listBox({ isDisabled: () => x() }, state)` and `listBox({ isDisabled: true }, state)` both work. Hooks return plain objects whose dynamic values are accessors, which is why `<button {...buttonProps} />` re-renders nothing.

Writing a component of your own on top of a hook, `fromProps(props)` turns `Incoming<P>` into hook options, and `callback(props.validate)` unwraps a non-`on*` function prop. Both live in `utils.ts` and both exist because a handler and a Cell are the same thing at runtime — a function — so the distinction has to be made at one boundary.

## Styling

There is no CSS. State is exposed as data attributes on the elements the components render, so a stylesheet selects on presence:

```css
[data-selected] {
  background: canvas;
}
[data-focus-visible] {
  outline: 2px solid;
}
[data-disabled] {
  opacity: 0.5;
}
```

The attributes are `data-selected`, `data-focused`, `data-focus-visible`, `data-hovered`, `data-pressed`, `data-disabled`, `data-readonly`, `data-invalid`, `data-required`, `data-open`, `data-placeholder`, `data-dragging`, `data-orientation`, `data-placement`, `data-empty` and `data-virtualized`. A boolean one is its **presence**: `data-pressed=""` when true and absent when false, so the selector is `[data-pressed]` and never `[data-pressed="true"]`.

A component forwards what it has no opinion about: the global attributes (`dir`, `lang`, `hidden`, `inert`, `translate`), the global events, `id`, and anything `data-*`. That is what lets a design system put its own marker on the element it styles — `<Checkbox data-slot="checkbox">` reaches the `<label>` — without a wrapper element in the way. A prop the component owns never becomes an attribute, so `isDisabled` writes `data-disabled` and not `isdisabled="true"`.

## Overlays are portalled

`<Popover>` and `<Modal>` render into `document.body` through barq's `<Portal>`, keeping their lexical scope so a portalled overlay still reads the providers it was written inside. A popover under an ancestor with `overflow: hidden` or a `transform` would otherwise be clipped or anchored against the wrong box.

A root popover renders a `display: contents` container and offers it to popovers opened from inside it, so a submenu lands in its parent's group: the two count as one overlay for outside-press dismissal and for `aria-hidden`.

To send overlays somewhere else — a shadow root, a fullscreen element, a container you style — wrap the tree:

```tsx
<PortalProvider getContainer={() => shadowRoot}>{children}</PortalProvider>
```

## Validation

Every field takes `validate` and `validationBehavior`:

```tsx
<TextField label="Email" validate={(value) => (value.includes("@") ? null : "Not an email")} />
<NumberField label="Quantity" validate={(n) => (n > 0 ? null : "At least one")} />
<ColorField label="Brand" validate={(colour) => (colour.getChannelValue("alpha") < 1 ? "No transparency" : null)} />
```

`validate` receives the field's own value: a number for `<NumberField>`, a `Color` for `<ColorField>`, a `DateValue` for `<DateField>`, the selected key for `<Select>`. It is **not** called for an empty value — `null` and `undefined` mean the field is blank, and blank is `isRequired`'s business. Under `validationBehavior="native"` the page's errors are written onto the hidden control with `setCustomValidity`, so the browser refuses the submit and focuses the first invalid field.

`<Form>` provides `validationBehavior` and server errors to every field inside it.

## Virtualisation

A list of ten thousand rows renders the window that is on screen:

```tsx
<Virtualizer layout={listLayout({ rowHeight: 32 })}>
  <ListBox label="Cities" items={cities()} style={{ height: "300px", overflow: "auto" }}>
    {(city) => <Option>{city.name}</Option>}
  </ListBox>
</Virtualizer>
```

The collection is whole throughout: selection, typeahead and `aria-setsize` all see every item, and only the DOM is a window. Keyboard navigation moves by the layout rather than by measuring elements, because Page Down has to reach a row that does not exist yet. Row heights may be fixed (`rowHeight`) or estimated and measured (`estimatedRowHeight`). `<ListBox>`, `<GridList>` and `<Table>` all accept it.

Unlike react-aria there is no view recycling: `<For>` keys rows by item, so a row that stays in the window keeps its element and its state across a scroll.

## What is here

| module           | what                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`       | `isMac`, `isIOS`, `isWebKit`, …                                                                                                                                   |
| `dom`            | ownership, shadow-safe `contains`/`activeElement`, `isFocusable`/`isTabbable`, `scrollIntoViewport`                                                               |
| `utils`          | `mergeProps`, `id`/`mergeIds`, `filterDOMProps`, `controllable`, `fromProps`, `callback`, `styleProps`                                                            |
| `interactions`   | `press`, `hover`, `focused`, `focusWithin`, `keyboard`, `longPress`, `move`, `interactOutside`, `scrollWheel`, `focusable`, `modality`/`focusVisible`, `openLink` |
| `focus`          | `FocusWalker`, `createFocusManager`, `focusScope`, `focusRing`                                                                                                    |
| `i18n`           | `useLocale`, `collator`, `filter`, number/date/list formatters, `StringFormatter`, `NumberParser`                                                                 |
| `live`           | `announce`, `visuallyHidden`                                                                                                                                      |
| `collections`    | `Collection`, `ListCollection`, `Selection`, `SelectionManager`, `listState`                                                                                      |
| `selection`      | `ListKeyboardDelegate`, `typeSelect`, `selectableItem`, `selectableList`, `selectableCollection`                                                                  |
| `overlays`       | `overlayTrigger`, `overlay`, `ariaHideOutside`, `preventScroll`, `overlayPosition`, `modalOverlay`                                                                |
| `virtualizer`    | `Layout`, `ListLayout`, `virtualizer`, `<Virtualizer>`                                                                                                            |
| `date` · `color` | barq's answers to `@internationalized/date` and `@react-stately/color`                                                                                            |
| `validation`     | `formValidationState`, `fieldValidation`, `formValidation`                                                                                                        |

Components: `Button` `ToggleButton` `Checkbox` `CheckboxGroup` `Switch` `RadioGroup` `Radio` `Link` `Separator` `ProgressBar` `Meter` `TextField` `SearchField` `NumberField` `ListBox` `Option` `Menu` `MenuTrigger` `SubmenuTrigger` `ContextMenu` `Select` `ComboBox` `GridList` `Table` `TagGroup` `Tabs` `Toolbar` `Breadcrumbs` `Disclosure` `Dialog` `Modal` `Popover` `Slider` `Calendar` `RangeCalendar` `DateField` `TimeField` `DatePicker` `ColorPicker` `ColorSlider` `ColorArea` `ColorWheel` `ColorField` `ColorSwatch` `Tooltip` `Form` `Virtualizer`.

## What is not here

Deliberately absent:

- **Drag and drop.** `useDrag`, `useDrop`, the droppable collections and the drop indicators. Nothing in this package has a drag surface, and the layout seam that a virtualised drop target needs is not built.
- **React plumbing.** `useEffectEvent`, `useObjectRef`, `useLayoutEffect`, `useValueEffect`, `useSyncRef`, `useDeepMemo`, `useCachedChildren` and the rest exist to work around React's model. `@barqjs/primitives` covers the ones that are real behaviour — `resizeObserver`, `windowSize`, `clipboard`.
- **Colour contrast and reading order** in `@barqjs/testing`'s `ariaViolations`. A headless DOM cannot answer either, and a wrong answer is worse than none.

Not built yet, in rough order of how much is missing:

- **Toast** and its region. **Tree** and `TreeItem`. **Autocomplete** and `SearchAutocomplete`. **StepList**. **TokenField**. **ActionGroup**. **ToggleButtonGroup**. **Landmark** navigation.
- **Selection checkboxes** for a grid, gridlist and table (`useGridSelectionCheckbox` and its siblings), and the selection announcement that goes with them.
- **Load more**: `useLoadMore` and the sentinel, for a collection that pages as it scrolls.
- **Table column resizing**.
- **Calendar month and year pickers** — the grid and the cells are there, the two dropdowns are not.
- `useColorChannelField`, and the gradient helper behind a colour area's background.
- Time zones and non-Gregorian calendars in `date.ts`; colour spaces beyond RGB, HSL and HSB in `color.ts`. Both modules state their limits in their own headers.

## Things that will bite

- **`<For each={x}>` where `x` is an identifier bound to an accessor does not work.** The compiler wraps it as `() => x`, so `For` iterates the function. Write `each={() => x()}`.
- **Keying a `<For>` by an object built in the `each` expression rebuilds every row on every read**, and the row holding focus is destroyed under the user. `datefield.tsx` keys its segments by index for exactly this reason.
- **A callback prop must declare its parameter.** `callback()` tells a handler from a Cell by arity, so `validate={() => "Bad"}` is read as a Cell and called, and the message becomes the callback. Write `validate={(value) => "Bad"}`.
- **A component's JSX in a `const` is built eagerly.** `const body = <div/>` constructs it there and then; put it in a component or inline it where it belongs, or a conditional above it will not gate it.

## License

MIT
