# @barqjs/lexical

[Lexical](https://lexical.dev) for barq: a composer that builds an editor from
Lexical extensions, an editable root, decorator nodes drawn by barq
components, typeahead and node menus, Yjs collaboration, and editor state as
signals. It is the barq counterpart of `@lexical/react` 0.53 and ports only
that package's thin layer. Rich and plain text, history, lists, links,
tables, code, markdown and the rest are Lexical's own framework-free
extensions and are used as they are.

## Install

```bash
bun add @barqjs/lexical lexical @lexical/rich-text @lexical/history
bun add -d @barqjs/vite
```

`@barqjs/core`, `@barqjs/web` and `@barqjs/server` are peer dependencies. The
package ships its TypeScript source under the `barq` export condition, and
`@barqjs/vite` compiles it for the DOM or the server with the rest of the
application. `yjs` is an optional peer dependency, needed only by
`@barqjs/lexical/collaboration`.

## Example

A message composer: rich text, history, lists, links, markdown shortcuts, a
toolbar that follows the selection, and a change listener.

```tsx
import { HistoryExtension } from "@lexical/history";
import { LinkExtension } from "@lexical/link";
import { ListExtension } from "@lexical/list";
import { TRANSFORMERS, registerMarkdownShortcuts } from "@lexical/markdown";
import { RichTextExtension } from "@lexical/rich-text";
import { TabIndentationExtension } from "@lexical/extension";
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, defineExtension } from "lexical";
import {
  ContentEditable,
  LexicalComposer,
  OnChangePlugin,
  useLexicalEditor,
  useLexicalEditorState,
} from "@barqjs/lexical";

const Markdown = defineExtension({
  name: "acme/markdown",
  register: (editor) => registerMarkdownShortcuts(editor, TRANSFORMERS),
});

function Toolbar() {
  const editor = useLexicalEditor();
  const bold = useLexicalEditorState(() => {
    const selection = $getSelection();
    return $isRangeSelection(selection) && selection.hasFormat("bold");
  });
  return (
    <button
      aria-pressed={bold()}
      onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
    >
      Bold
    </button>
  );
}

export function Composer(props: { onSend: (json: string) => void }) {
  return (
    <LexicalComposer
      extensions={[
        RichTextExtension,
        HistoryExtension,
        ListExtension,
        LinkExtension,
        TabIndentationExtension,
        Markdown,
      ]}
      initialConfig={{ namespace: "messages", onError: (error) => console.error(error) }}
      contentEditable={null}
    >
      <Toolbar />
      <ContentEditable
        class="composer"
        aria-label="Message"
        placeholder={<span>Message #general</span>}
      />
      <OnChangePlugin onChange={(state) => props.onSend(JSON.stringify(state))} />
    </LexicalComposer>
  );
}
```

## The composer

`LexicalComposer` builds one editor when it is built and disposes it with the
component. It takes:

- `extensions`: the editor's extensions, as `LexicalExtensionComposer` takes
  its root extension. A course editor that defines one root extension with
  `defineExtension({ dependencies: [...] })` passes `[root]`.
- `initialConfig`: what `LexicalComposer` took in `@lexical/react`: `namespace`,
  `nodes`, `theme`, `onError`, `onWarn`, `editable`, `html` and `editorState`.
  It becomes the last extension, so its `namespace` and `theme` win. Omitted,
  `editorState` opens one empty paragraph; `null` leaves the root empty for a
  shared document to fill.
- `contentEditable`: the editable root rendered before the children.
  `<ContentEditable />` by default, `null` when the children render their own.

Both are read once, as `@lexical/react` reads `initialConfig`. To edit another
document, build another composer.

`useLexicalEditor()` returns the editor anywhere inside, and
`useLexicalComposerContext()` returns `[editor, { getTheme }]`, the shape
`@lexical/react` code destructures. A decorator's component and a portalled
menu read both too: a portal keeps the scope it was written in.

`ContentEditable` binds the editor to its `<div>`, mirrors whether the editor
is editable onto `contenteditable` and the ARIA attributes, and takes a
`placeholder` (JSX, or a function of whether the editor is editable) shown
while the document is empty. `ContentEditableElement` is the same without the
placeholder, for an editor that is not in context.

## Decorator nodes

Barq JSX builds where it is written, so a decorator node's `decorate()` cannot
return the element the way a React one does. It returns how to build it: a
function handed the node as an accessor.

```tsx
import {
  type Decoration,
  DecoratorBlockNode,
  useLexicalEditable,
  useLexicalNodeSelection,
} from "@barqjs/lexical";

function Chart(props: { nodeKey: string; title: string }) {
  const editable = useLexicalEditable();
  const [selected, setSelected] = useLexicalNodeSelection(props.nodeKey);
  return (
    <figure data-selected={selected() ? "" : undefined} onClick={() => setSelected(true)}>
      <figcaption>{props.title}</figcaption>
      {editable() ? <button>Edit data</button> : null}
    </figure>
  );
}

export class ChartNode extends DecoratorBlockNode {
  __title = "";

  $config() {
    return this.config("chart", { extends: DecoratorBlockNode });
  }

  decorate(): Decoration<this> {
    return (node) => <Chart nodeKey={node().getKey()} title={node().__title} />;
  }
}
```

The composer calls that function once, under its own scope and inside the
element Lexical made for the node, and keeps the component for as long as the
element lives. When the node changes, `node()` moves to the new version and
whatever read it updates in place, so the component keeps its state and its
focus. When the node goes, the component is disposed. Each one renders inside
the configured error boundary, `LexicalErrorBoundary` by default, which shows
a notice in place of a component that throws and reports the error to the
editor's `onError`.

`DecoratorBlockNode` is the port of `@lexical/react`'s: a block-level decorator
with an alignment `format`, serialized by its schema.

A decorator that hosts named slots puts each one where it wants it with
`ref={useLexicalSlotRef(editor, nodeKey, "caption")}`.

## Menus

`LexicalTypeaheadMenuPlugin` opens while the text before the caret matches
`triggerFn`; `LexicalNodeMenuPlugin` opens against the node `nodeKey` names.
Both take `options` (instances of `MenuOption` or a subclass), report the query
through `onQueryChange`, and apply a choice through `onSelectOption`, which is
handed the text node holding the query so the option can replace it.

```tsx
<LexicalTypeaheadMenuPlugin<PersonOption>
  triggerFn={basicTypeaheadTriggerMatch("@", { minLength: 0 })}
  onQueryChange={setQuery}
  options={people()}
  onSelectOption={(option, node, closeMenu) => {
    node?.replace($createMentionNode(option.name, option.id));
    closeMenu();
  }}
  menuRenderFn={(menu) => (
    <For each={menu.options()}>
      {(option, index) => (
        <div
          role="option"
          id={menu.optionId(index())}
          aria-selected={menu.selectedIndex() === index()}
          onClick={() => menu.selectOptionAndCleanUp(option)}
        >
          {option.name}
        </div>
      )}
    </For>
  )}
/>
```

The menu is a `listbox` appended to the body (or the editor's shadow root, or
`parent`), placed against the caret or the node with `@floating-ui/dom`, and
kept there through scrolling and resizing; it closes when its anchor scrolls
out of the editor's scroll container. Focus stays in the editor, which points
`aria-controls` at the listbox and `aria-activedescendant` at the highlighted
option. Arrow keys move the highlight, Enter and Tab choose, Shift+Enter is
left to the editor, Escape closes. Without `menuRenderFn` the menu draws a
`<ul>` of each option's `icon` and `title`.

`menuRenderFn` returns the menu's contents, which are placed inside the
listbox; it needs no portal of its own. What it is handed is accessors and
functions: `options()`, `selectedIndex()`, `matchingString()`,
`selectOptionAndCleanUp(option)`, `setHighlightedIndex(index)` and
`optionId(index)`, the `id` an option must carry for
`aria-activedescendant` to point at it.

## Collaboration

```tsx
import { CollaborationPlugin, LexicalCollaboration } from "@barqjs/lexical/collaboration";

<LexicalCollaboration>
  <LexicalComposer extensions={[root]} initialConfig={{ editorState: null }}>
    <CollaborationPlugin
      id={documentId}
      providerFactory={(id, docs) => createProvider(id, docs)}
      shouldBootstrap={false}
      username="Salama"
      cursorColor="#0a7"
    />
  </LexicalComposer>
</LexicalCollaboration>;
```

`CollaborationPlugin` binds the editor to the `XmlText` root of the provider's
document, syncs both ways, replaces history with the document's undo manager,
publishes focus and cursor positions in the awareness state, and draws the
other users' cursors into `cursorsContainer` or the body. A new `id` or
`providerFactory` replaces the provider; the binding is made once, so editing
another document takes another composer. `CollaborationPluginV2__EXPERIMENTAL`
is the port of Lexical's second binding, over a `doc` and `provider` the
application owns.

## Editor state as signals

Each hook subscribes for the owner it runs under and returns an accessor:

- `useLexicalEditable()`: whether the editor accepts input.
- `useLexicalEditorState()`: the editor state after each update, or
  `useLexicalEditorState(() => $getRoot().getTextContent())` for what a `$`
  function reads from it.
- `useLexicalIsTextContentEmpty(editor, trim?)` and
  `useLexicalCanShowPlaceholder(editor)`.
- `useLexicalNodeSelection(key)`: `[isSelected, setSelected, clearSelected]`.
- `useLexicalSubscription(subscription)`: any value a listener reports.
- `useSignalValue(signal)` and `useExtensionSignalValue(extension, "canUndo")`:
  a signal an extension outputs, such as `HistoryExtension`'s.

Beside them: `useExtensionDependency`, `useOptionalExtensionDependency`,
`usePeerExtensionDependency` and `useExtensionComponent` look up the editor's
extensions; `useLexicalTextEntity` turns matching text into a node as it is
typed; `useLexicalFocusManagerRef`, `useLexicalRovingTabIndexRef`,
`useLexicalFocusTrapRef` and `useLexicalAriaLiveRegion` are refs and an
announcer over `@lexical/a11y`'s extensions. `OnChangePlugin` calls
`onChange` after each update, skipping history merges and, if asked,
selection-only updates.

## Server rendering

On the server the composer builds the same editor from the same extensions
and touches no DOM. `ContentEditable` renders its `<div>` empty, with the
placeholder when the initial document is empty; decorators and menus render
nothing. In the browser the page hydrates without a mismatch, the editor binds
to the element the server sent and fills it, and decorator components mount
into their nodes once hydration has ended.

A server that reads or writes documents without a screen, for collaboration or
for export, uses `buildEditorFromExtensions` from `@lexical/extension` with the
same extensions. `decorate()` is never called there.

## Extensions for barq UI

`BarqExtension` is what `ReactExtension` is to React: it builds the component
that renders an editor, from a `contentEditable` component, an `ErrorBoundary`
and `decorators`, components every editor with the extension renders. An
extension that brings UI of its own adds it with
`configExtension(BarqExtension, { decorators: [Panel] })`.

`BarqPluginHostExtension` hosts barq UI for an editor that no composer
renders: `mountBarqPluginHost(editor, container)` once, then
`mountBarqPluginComponent(editor, { key, Component, props })` or
`mountBarqPluginElement(editor, { key, render })` for each piece, with a
`domNode` to put it elsewhere.

## Coming from `@lexical/react`

- The plugins that only registered an extension's behaviour are the
  extensions: `RichTextPlugin` is `RichTextExtension`, `HistoryPlugin` is
  `HistoryExtension`, and so on for lists, links, autolinks, tab indentation,
  tables, check lists and hashtags. A `register*` function such as
  `registerMarkdownShortcuts` goes in an extension's `register`, or in a
  component as `onCleanup(registerMarkdownShortcuts(editor, transformers))`.
- `LexicalComposer` and `LexicalExtensionComposer` are one component.
- `decorate()` returns `(node) => <Component />`, as above.
- `menuRenderFn` returns the menu's contents rather than a portal into an
  anchor ref, and option ids come from `optionId(index)`.
- `useBasicTypeaheadTriggerMatch` is `basicTypeaheadTriggerMatch`: a plain
  function, with nothing to memoise.
- Hooks return accessors, and the ref hooks return barq refs: a callback that
  answers its own cleanup.
- `cursorsContainerRef` is `cursorsContainer`, the element itself.

## License

MIT
