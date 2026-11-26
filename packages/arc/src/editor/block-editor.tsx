import { For, Show, createMemo, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { PressEvent } from "@barqjs/aria/interactions";
import { announce } from "@barqjs/aria/live";
import { useLexicalEditor } from "@barqjs/lexical";
import { GripVertical } from "@barqjs/lucide/icons/grip-vertical";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Button } from "@barqjs/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@barqjs/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui/popover";
import { tokens } from "@barqjs/ui/theme/tokens";
import { Portal } from "@barqjs/web";
import { $isListNode } from "@lexical/list";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  type ElementNode,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  mergeRegister,
} from "lexical";

import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, interaction, layout, place, rounded, space, target, zIndex } from "../style/index.ts";
import {
  $blockKind,
  $textBlockOf,
  $turnInto,
  TEXT_BLOCK_TYPES,
  type TextBlockType,
  duplicateBlock,
  editorConversions,
  removeBlock,
  shortcutLabel,
  textBlockLabel,
} from "./commands.ts";
import { labelOf } from "./blocks.tsx";
import { $rootBlockOf } from "./containers.tsx";
import { $clipboardTarget, copyTarget, cutTarget, pasteAt } from "./paste.ts";
import {
  type BlockConversion,
  type BlockMenuChoice,
  type Label,
  editorExtensions,
  keysMatch,
} from "./extension.ts";
import { editorSignal, useRegistration } from "./hooks.ts";
import { RichTextEditor, type RichTextEditorProps } from "./rich-text-editor.tsx";
import { type SlashCommand, SlashCommandMenu, editorCommands } from "./typeahead.tsx";

export const blockEditorStyles = variants({
  slots: {
    content: arc({
      paddingInlineStart: space.x14,
      // Over the empty block's start, so the caret stays where it is.
      "& [data-placeholder]": { position: "relative" },
      "& [data-placeholder]::before": {
        content: "attr(data-placeholder)",
        position: "absolute",
        insetInlineStart: "0px",
        color: tokens.mutedForeground,
        pointerEvents: "none",
        userSelect: "none",
      },
    }),
    gutter: arc(layout.row, gap[0.5], {
      position: "absolute",
      insetInlineStart: "0px",
      zIndex: zIndex.sticky,
    }),
    handle: arc(target.size, interaction.draggable),
    indicator: arc(rounded.full, place.passive, {
      insetInline: space.x14,
      height: "2px",
      marginBlockStart: "-1px",
      backgroundColor: tokens.ring,
    }),
    picker: arc({ width: "min(20rem, calc(100vw - 2rem))", padding: "0px" }),
    chips: arc(layout.row, layout.wrap, gap[1], place.paddedLine),
    chip: arc(rounded.full),
  },
});

type Slots = ReturnType<typeof blockEditorStyles>;

interface ActiveBlock {
  key: NodeKey;
  top: number;
  index: number;
  count: number;
  /** A text style or a kind of block of an extension's, which Turn into offers to change. */
  kind: string | null;
  /** What the extensions' block menus offer this block, each with what it has now. */
  choices: readonly OfferedChoice[];
}

interface OfferedOption {
  value: string;
  label: Label;
}

interface OfferedChoice {
  choice: BlockMenuChoice;
  value: string;
  options: readonly OfferedOption[];
}

/**
 * Moves the top-level block with `key` by `step` places, and tells `moved`
 * where it went, counted from one, out of how many.
 */
export function moveBlock(
  editor: LexicalEditor,
  key: NodeKey,
  step: -1 | 1,
  moved?: (position: number, count: number) => void,
): void {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if (node === null) return;
    const sibling = step < 0 ? node.getPreviousSibling() : node.getNextSibling();
    if (sibling === null) return;
    if (step < 0) sibling.insertBefore(node);
    else sibling.insertAfter(node);
    moved?.(node.getIndexWithinParent() + 1, $getRoot().getChildrenSize());
  });
}

/** Moves the block with `key` to `index` among the top-level blocks. */
function moveTo(
  editor: LexicalEditor,
  key: NodeKey,
  index: number,
  moved: (position: number, count: number) => void,
): void {
  editor.update(() => {
    const node = $getNodeByKey(key);
    const root = $getRoot();
    if (node === null) return;
    const from = node.getIndexWithinParent();
    if (index === from || index === from + 1) return;
    const before = root.getChildAtIndex(index);
    if (before === null) root.getLastChildOrThrow().insertAfter(node);
    else before.insertBefore(node);
    moved(node.getIndexWithinParent() + 1, root.getChildrenSize());
  });
}

/** Whether the range selection is inside `node`. */
function $isSelectionIn(node: ElementNode): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const anchor = selection.anchor.getNode();
  return anchor.is(node) || anchor.getParents().some((one) => one.is(node));
}

/** Runs a picker's command on a new line after the block with `key`. */
function insertAfter(editor: LexicalEditor, key: NodeKey, command: SlashCommand): void {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if (node === null) return;
    const line = $createParagraphNode();
    node.insertAfter(line);
    line.select();
    command.run(editor);
  });
}

export interface BlockEditorProps extends Omit<RichTextEditorProps, "variant"> {
  /** Classes for the block editor's own parts. */
  blockClasses?: Customisable<Slots>["classes"];
  /**
   * What an empty block says it is for, faint: the caret's empty line, and
   * every empty heading, quote, list item and code block. `false` for none.
   * @default arc's words for each kind
   */
  blockPlaceholders?: false | Partial<Record<TextBlockType, string>>;
}

/**
 * A page-like document: `RichTextEditor` without a box, a block at a time.
 * Beside the block under the pointer or the caret sit a `+` that opens a
 * searchable, grouped picker of what to insert after it, and a grip that
 * drags the block to a new place, by mouse or by finger, and opens its menu
 * when pressed: Turn into, Duplicate, Move up, Move down, Delete. Mod+Shift
 * with the arrows moves the caret's block, each move announced. `/` offers
 * the same blocks inline, and `extensions` adds an app's own, built from
 * arc's pieces with `defineBlock` or `defineEditorExtension`.
 *
 * ```tsx
 * <BlockEditor label="Page" extensions={[Quiz, Rating]} defaultValue={page.body} onChange={save} />
 * ```
 *
 * The gutter is at the start of the line, so it sits on the right in a
 * right-to-left document, and it is reached by Tab from the text, so a
 * keyboard has everything a pointer has.
 */
export function BlockEditor(props: BlockEditorProps) {
  function cls(): Slots {
    return parts(blockEditorStyles(), props.blockClasses);
  }
  return (
    <RichTextEditor
      {...props}
      variant="plain"
      classes={{ ...props.classes, content: arc(cls().content, props.classes?.content) }}
    >
      <Show when={props.blockPlaceholders !== false}>
        <BlockPlaceholders
          words={props.blockPlaceholders === false ? undefined : props.blockPlaceholders}
          documentPlaceholder={props.placeholder !== undefined}
        />
      </Show>
      <BlockHandles cls={cls()} />
      <SlashCommandMenu />
      {props.children}
    </RichTextEditor>
  );
}

interface BlockPlaceholdersProps {
  words?: Partial<Record<TextBlockType, string>>;
  documentPlaceholder: boolean;
}

/** Marks each empty block with what it is for, as `data-placeholder`, which the content's style draws. */
function BlockPlaceholders(props: BlockPlaceholdersProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  let marked = new Set<HTMLElement>();
  const placeholders = editorExtensions(editor).flatMap((extension) =>
    extension.placeholder === undefined ? [] : [extension.placeholder],
  );
  function word(block: TextBlockType): string {
    const all = messages();
    const own: Record<TextBlockType, string> = {
      paragraph: all.blockPlaceholder,
      h1: all.headingLevel(1),
      h2: all.headingLevel(2),
      h3: all.headingLevel(3),
      quote: all.quote,
      code: all.codeBlock,
      bullet: all.bulletList,
      number: all.numberedList,
      check: all.checkList,
    };
    return props.words?.[block] ?? own[block];
  }
  function mark(): void {
    const wanted = editor.getEditorState().read(() => {
      const out = new Map<NodeKey, string>();
      const root = $getRoot();
      const selection = $getSelection();
      const caret =
        $isRangeSelection(selection) && selection.isCollapsed() && editor.isEditable()
          ? selection.anchor.getNode()
          : null;
      // The editor's own placeholder speaks for a document with nothing in it.
      const lone = props.documentPlaceholder && root.getChildrenSize() === 1;
      function consider(node: ElementNode): void {
        if (node.getTextContentSize() > 0) return;
        for (const own of placeholders) {
          const label = own(node);
          if (label !== null) {
            out.set(node.getKey(), labelOf(label, messages()));
            return;
          }
        }
        const block = $textBlockOf(node);
        if (block === null) return;
        const holdsCaret =
          caret !== null && (caret.is(node) || caret.getParents().some((one) => one.is(node)));
        if (block === "paragraph" && (!holdsCaret || lone)) return;
        out.set(node.getKey(), word(block));
      }
      // Every block, those inside containers too; a table's cells are left to their table.
      function walk(node: LexicalNode): void {
        if (!$isElementNode(node) || node.isInline() || node.getType() === "table") return;
        if (!$isListNode(node)) consider(node);
        for (const child of node.getChildren()) walk(child);
      }
      for (const child of root.getChildren()) walk(child);
      return out;
    });
    const next = new Set<HTMLElement>();
    for (const [key, text] of wanted) {
      const element = editor.getElementByKey(key);
      if (element === null) continue;
      if (element.dataset.placeholder !== text) element.dataset.placeholder = text;
      next.add(element);
    }
    for (const element of marked) if (!next.has(element)) delete element.dataset.placeholder;
    marked = next;
  }
  useRegistration(() =>
    mergeRegister(
      editor.registerUpdateListener(mark),
      editor.registerEditableListener(mark),
      editor.registerRootListener(mark),
    ),
  );
  return null;
}

interface BlockHandlesProps {
  cls: Slots;
}

interface BlockPlace {
  key: NodeKey;
  index: number;
}

function BlockHandles(props: BlockHandlesProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const [active, setActive] = editorSignal<ActiveBlock | null>(null);
  const [menu, setMenuSignal] = createSignal(false, { ownedWrite: true });
  // Read where it is written, so kept beside the staged signal.
  let menuOpen = false;
  function setMenu(open: boolean): void {
    menuOpen = open;
    setMenuSignal(open);
  }
  const [picker, setPicker] = createSignal(false, { ownedWrite: true });
  const [drop, setDrop] = createSignal<number | null>(null, { ownedWrite: true });
  const [search, setSearch] = createSignal("", { ownedWrite: true });
  const [scroller, setScroller] = editorSignal<HTMLElement | null>(null);
  let dragged = false;
  let pinned = false;

  const blockMenu = editorExtensions(editor).flatMap((extension) => extension.blockMenu ?? []);
  const conversions = editorConversions(editorExtensions(editor));
  function measure(key: NodeKey): ActiveBlock | null {
    const element = editor.getElementByKey(key);
    const body = scroller();
    if (element === null || body === null) return null;
    return editor.read(() => {
      const node = $getNodeByKey(key);
      if (node === null) return null;
      return {
        key,
        top:
          element.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop,
        index: node.getIndexWithinParent(),
        count: $getRoot().getChildrenSize(),
        kind: $blockKind(node, conversions),
        choices: blockMenu.flatMap((choice) => {
          const offered = choice.$read(node);
          return offered === null ? [] : [{ choice, ...offered }];
        }),
      };
    });
  }

  function follow(key: NodeKey | null): void {
    if (pinned || menuOpen) return;
    setActive(key === null ? null : measure(key));
  }

  function refresh(key: NodeKey): void {
    setActive(measure(key));
  }

  function caretBlock(): NodeKey | null {
    return editor.read(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection)
        ? ($rootBlockOf(selection.anchor.getNode())?.getKey() ?? null)
        : null;
    });
  }

  function blockAt(y: number): BlockPlace | null {
    const keys = editor.read(() => $getRoot().getChildrenKeys());
    for (const [index, key] of keys.entries()) {
      const box = editor.getElementByKey(key)?.getBoundingClientRect();
      if (box !== undefined && y >= box.top && y <= box.bottom) return { key, index };
    }
    return null;
  }

  function dropIndex(y: number): number {
    const keys = editor.read(() => $getRoot().getChildrenKeys());
    for (const [index, key] of keys.entries()) {
      const box = editor.getElementByKey(key)?.getBoundingClientRect();
      if (box !== undefined && y < box.top + box.height / 2) return index;
    }
    return keys.length;
  }

  function move(step: -1 | 1): void {
    const current = active();
    if (current === null) return;
    moveBlock(editor, current.key, step, (position, count) =>
      announce(messages().blockMoved(position, count), "polite"),
    );
    follow(current.key);
  }

  useRegistration(() =>
    mergeRegister(
      editor.registerUpdateListener(() => {
        const current = active();
        follow(pinned && current !== null ? current.key : (caretBlock() ?? current?.key ?? null));
      }),
      editor.registerRootListener((root, previous) => {
        function onPointer(event: PointerEvent): void {
          if (event.pointerType === "touch") return;
          const found = blockAt(event.clientY);
          if (found !== null) follow(found.key);
        }
        // A right click on a block opens its menu; Shift, a field or a link keep the browser's own.
        function onContext(event: MouseEvent): void {
          if (event.shiftKey || !editor.isEditable()) return;
          const clicked = event.target as Element | null;
          if ((clicked?.closest("input, textarea, select, a[href]") ?? null) !== null) return;
          const found = blockAt(event.clientY);
          if (found === null) return;
          event.preventDefault();
          follow(found.key);
          setMenu(true);
        }
        previous?.removeEventListener("pointermove", onPointer);
        previous?.removeEventListener("contextmenu", onContext);
        root?.addEventListener("pointermove", onPointer);
        root?.addEventListener("contextmenu", onContext);
        setScroller(root?.parentElement ?? null);
      }),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          const mod = event.metaKey || event.ctrlKey;
          const moving =
            event.altKey && event.shiftKey && !mod && (event.key === "ArrowUp" || event.key === "ArrowDown");
          if ((mod && event.shiftKey && !event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) || moving) {
            const key = caretBlock();
            if (key === null) return false;
            event.preventDefault();
            follow(key);
            move(event.key === "ArrowUp" ? -1 : 1);
            return true;
          }
          if (keysMatch(event, "Mod+d")) {
            const key = caretBlock();
            if (key === null) return false;
            event.preventDefault();
            duplicateBlock(editor, key);
            return true;
          }
          if (mod && event.key === "/") {
            const key = caretBlock();
            if (key === null) return false;
            event.preventDefault();
            follow(key);
            setMenu(true);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    ),
  );

  const commands = createMemo(() =>
    editorCommands(messages(), editorExtensions(editor), editor, "picker"),
  );
  const groups = createMemo(() => {
    const out = new Map<string, SlashCommand[]>();
    for (const command of commands()) {
      const group = command.group ?? "";
      out.set(group, [...(out.get(group) ?? []), command]);
    }
    return [...out.entries()];
  });

  function onGripDown(event: PointerEvent): void {
    const current = active();
    if (current === null || event.button !== 0) return;
    const grip = event.currentTarget as HTMLElement;
    const startY = event.clientY;
    dragged = false;
    pinned = true;
    function onMove(next: PointerEvent): void {
      if (!dragged && Math.abs(next.clientY - startY) < 6) return;
      dragged = true;
      setDrop(dropIndex(next.clientY));
    }
    const onUp: () => void = () => {
      grip.removeEventListener("pointermove", onMove);
      grip.removeEventListener("pointerup", onUp);
      grip.removeEventListener("pointercancel", onUp);
      pinned = false;
      const index = drop();
      setDrop(null);
      if (dragged && index !== null) {
        moveTo(editor, current.key, index, (position, count) =>
          announce(messages().blockMoved(position, count), "polite"),
        );
      }
    };
    grip.setPointerCapture?.(event.pointerId);
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    grip.addEventListener("pointercancel", onUp);
  }

  // Before the button's own press handling, which keeps the events to itself.
  function gripKeys(element: HTMLSpanElement): () => void {
    function onKey(event: KeyboardEvent): void {
      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      event.preventDefault();
      event.stopPropagation();
      move(event.key === "ArrowUp" ? -1 : 1);
    }
    element.addEventListener("pointerdown", onGripDown, true);
    element.addEventListener("keydown", onKey, true);
    return () => {
      element.removeEventListener("pointerdown", onGripDown, true);
      element.removeEventListener("keydown", onKey, true);
    };
  }

  // Only the list scrolls to a group, never the page behind the picker.
  function jumpTo(from: EventTarget | null, group: string): void {
    const box = (from as Element | null)?.closest('[data-slot="block-picker"]') ?? null;
    const list = box?.querySelector<HTMLElement>('[data-slot="command-list"]') ?? null;
    const heading = [
      ...(box?.querySelectorAll<HTMLElement>('[data-slot="command-group-label"]') ?? []),
    ].find((one) => one.textContent === group);
    if (list !== null && heading !== undefined) list.scrollTop = heading.offsetTop - list.offsetTop;
    box?.querySelector<HTMLElement>('[data-slot="command-input"]')?.focus();
  }

  function indicatorTop(): number | null {
    const index = drop();
    const body = scroller();
    if (index === null || body === null) return null;
    const keys = editor.read(() => $getRoot().getChildrenKeys());
    const key = keys[Math.min(index, keys.length - 1)];
    const box = key === undefined ? null : editor.getElementByKey(key)?.getBoundingClientRect();
    if (box === null || box === undefined) return null;
    const bodyTop = body.getBoundingClientRect().top - body.scrollTop;
    return (index >= keys.length ? box.bottom : box.top) - bodyTop;
  }

  return (
    <Show when={scroller()}>
      {(body: () => HTMLElement) => (
        <Portal mount={body()}>
          <Show when={indicatorTop() !== null}>
            <div
              class={props.cls.indicator}
              data-slot="block-drop-indicator"
              style={{ top: `${String(indicatorTop())}px` }}
            />
          </Show>
          <Show when={active()}>
            {(current: () => ActiveBlock) => (
              <div
                class={props.cls.gutter}
                data-slot="block-handle"
                style={{ top: `${String(current().top)}px` }}
              >
                <Popover
                  isOpen={picker()}
                  onOpenChange={(open: boolean) => {
                    setPicker(open);
                    if (!open) setSearch("");
                  }}
                >
                  <PopoverTrigger>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={messages().insertBlock}
                      data-slot="block-insert"
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class={props.cls.picker} align="start" data-slot="block-picker">
                    <Command label={messages().insertBlock} loop>
                      <CommandInput
                        placeholder={messages().searchBlocks}
                        value={search()}
                        onValueChange={setSearch}
                      />
                      <Show when={search() === "" && groups().length > 1}>
                        <div
                          class={props.cls.chips}
                          role="group"
                          aria-label={messages().blockGroups}
                          data-slot="block-picker-groups"
                        >
                          <For each={groups()}>
                            {(entry: [string, SlashCommand[]]) => (
                              <Button
                                variant="outline"
                                size="xs"
                                class={props.cls.chip}
                                data-slot="block-picker-group"
                                onPress={(event: PressEvent) => jumpTo(event.target, entry[0])}
                              >
                                {entry[0]}
                              </Button>
                            )}
                          </For>
                        </div>
                      </Show>
                      <CommandList>
                        <CommandEmpty>{messages().noMatchingBlocks}</CommandEmpty>
                        <For each={groups()}>
                          {(entry: [string, SlashCommand[]]) => (
                            <CommandGroup heading={entry[0]}>
                              <For each={entry[1]}>
                                {(command: SlashCommand) => (
                                  <CommandItem
                                    value={command.label}
                                    keywords={[...(command.keywords ?? [])]}
                                    onSelect={() => {
                                      setPicker(false);
                                      insertAfter(editor, current().key, command);
                                      editor.focus();
                                    }}
                                  >
                                    {command.icon?.()}
                                    {command.label}
                                  </CommandItem>
                                )}
                              </For>
                            </CommandGroup>
                          )}
                        </For>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <span class={layout.inlineRow} ref={gripKeys}>
                  <DropdownMenu
                    isOpen={menu()}
                    onOpenChange={(open: boolean) => {
                      if (open && dragged) {
                        dragged = false;
                        return;
                      }
                      setMenu(open);
                      if (!open) follow(caretBlock() ?? current().key);
                    }}
                  >
                    <DropdownMenuTrigger>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        class={props.cls.handle}
                        aria-label={messages().blockActions}
                        title={messages().dragBlock}
                        data-slot="block-grip"
                      >
                        <GripVertical aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent aria-label={messages().blockActions} align="start">
                      <Show when={current().kind !== null}>
                        <DropdownMenuLabel>{messages().turnInto}</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={current().kind ?? ""}
                          onValueChange={(value: string) => {
                            const key = current().key;
                            editor.update(() => {
                              const node = $getNodeByKey(key);
                              if (node === null) return;
                              const turned = $turnInto(node, value, conversions);
                              if ($isElementNode(turned) && !$isSelectionIn(turned)) {
                                turned.selectEnd();
                              }
                            });
                            editor.focus();
                          }}
                        >
                          <For each={TEXT_BLOCK_TYPES}>
                            {(type: TextBlockType) => (
                              <DropdownMenuRadioItem value={type}>
                                {textBlockLabel(type, messages())}
                              </DropdownMenuRadioItem>
                            )}
                          </For>
                          <For each={conversions}>
                            {(conversion: BlockConversion) => (
                              <DropdownMenuRadioItem value={conversion.id}>
                                {labelOf(conversion.label, messages())}
                              </DropdownMenuRadioItem>
                            )}
                          </For>
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator />
                      </Show>
                      <For each={current().choices}>
                        {(offered: OfferedChoice) => (
                          <>
                            <DropdownMenuLabel>
                              {labelOf(offered.choice.label, messages())}
                            </DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                              value={offered.value}
                              onValueChange={(value: string) => {
                                const key = current().key;
                                editor.update(() => {
                                  const node = $getNodeByKey(key);
                                  if (node !== null) offered.choice.$choose(node, value);
                                });
                                refresh(key);
                              }}
                            >
                              <For each={offered.options}>
                                {(option: OfferedOption) => (
                                  <DropdownMenuRadioItem value={option.value}>
                                    {labelOf(option.label, messages())}
                                  </DropdownMenuRadioItem>
                                )}
                              </For>
                            </DropdownMenuRadioGroup>
                            <DropdownMenuSeparator />
                          </>
                        )}
                      </For>
                      <DropdownMenuItem
                        onSelect={() =>
                          void cutTarget(
                            editor,
                            editor.read(() => $clipboardTarget(current().key)),
                          )
                        }
                      >
                        {messages().cut}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void copyTarget(
                            editor,
                            editor.read(() => $clipboardTarget(current().key)),
                          )
                        }
                      >
                        {messages().copy}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void pasteAt(
                            editor,
                            editor.read(() => $clipboardTarget(current().key)),
                            false,
                          )
                        }
                      >
                        {messages().paste}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void pasteAt(
                            editor,
                            editor.read(() => $clipboardTarget(current().key)),
                            true,
                          )
                        }
                      >
                        {messages().pasteAsText}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => duplicateBlock(editor, current().key)}>
                        {messages().duplicate}
                        <span aria-hidden="true">{shortcutLabel("Mod+D")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        isDisabled={current().index === 0}
                        onSelect={() => move(-1)}
                      >
                        {messages().moveUp}
                        <span aria-hidden="true">{shortcutLabel("Alt+Shift+↑")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        isDisabled={current().index >= current().count - 1}
                        onSelect={() => move(1)}
                      >
                        {messages().moveDown}
                        <span aria-hidden="true">{shortcutLabel("Alt+Shift+↓")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => removeBlock(editor, current().key)}
                      >
                        {messages().delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            )}
          </Show>
        </Portal>
      )}
    </Show>
  );
}
