import { For, Show, createMemo, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
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
  $parseSerializedNode,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  mergeRegister,
} from "lexical";

import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, interaction, layout, place, rounded, space, target, zIndex } from "../style/index.ts";
import type { AnyBlock } from "./blocks.tsx";
import {
  $textBlockOf,
  TEXT_BLOCK_TYPES,
  type TextBlockType,
  setTextBlock,
  shortcutLabel,
  textBlockLabel,
} from "./commands.ts";
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
  },
});

type Slots = ReturnType<typeof blockEditorStyles>;

interface ActiveBlock {
  key: NodeKey;
  top: number;
  index: number;
  count: number;
  /** A text block's type, which Turn into offers to change. */
  text: TextBlockType | null;
}

/** A node and everything under it as JSON, children included, for a copy. */
function $deepJSON(node: LexicalNode): SerializedLexicalNode {
  const json = node.exportJSON() as SerializedLexicalNode & { children?: SerializedLexicalNode[] };
  if ($isElementNode(node)) json.children = node.getChildren().map($deepJSON);
  return json;
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

function duplicate(editor: LexicalEditor, key: NodeKey): void {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if (node === null) return;
    node.insertAfter($parseSerializedNode($deepJSON(node)));
  });
}

function remove(editor: LexicalEditor, key: NodeKey): void {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if (node === null) return;
    const next = node.getNextSibling() ?? node.getPreviousSibling();
    node.remove();
    if ($getRoot().getChildrenSize() === 0) $getRoot().append($createParagraphNode());
    (next ?? $getRoot().getFirstChild())?.selectStart();
  });
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
 * the same blocks inline, and `blocks` adds an app's own, built from arc's
 * pieces with `defineBlock`.
 *
 * ```tsx
 * <BlockEditor label="Lesson" blocks={[Quiz, Callout]} defaultValue={lesson.body} onChange={save} />
 * ```
 *
 * The gutter is at the start of the line, so it sits on the right in a
 * right-to-left document, and it is reached by Tab from the text, so a
 * keyboard has everything a pointer has.
 */
export function BlockEditor(props: BlockEditorProps) {
  const cls = (): Slots => parts(blockEditorStyles(), props.blockClasses);
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
      <BlockHandles
        cls={cls()}
        blocks={props.blocks ?? []}
        images={props.upload !== undefined}
        tables={props.tables !== false}
      />
      <SlashCommandMenu
        blocks={props.blocks}
        tables={props.tables}
        images={props.upload !== undefined}
        embeds={props.embeds !== false}
      />
      {props.children}
    </RichTextEditor>
  );
}

/** Marks each empty block with what it is for, as `data-placeholder`, which the content's style draws. */
function BlockPlaceholders(props: {
  words?: Partial<Record<TextBlockType, string>>;
  documentPlaceholder: boolean;
}) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  let marked = new Set<HTMLElement>();
  const word = (block: TextBlockType): string => {
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
  };
  const mark = (): void => {
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
      const consider = (node: LexicalNode): void => {
        if (!$isElementNode(node) || node.getTextContentSize() > 0) return;
        const block = $textBlockOf(node);
        if (block === null) return;
        const holdsCaret =
          caret !== null && (caret.is(node) || caret.getParents().some((one) => one.is(node)));
        if (block === "paragraph" && (!holdsCaret || lone)) return;
        out.set(node.getKey(), word(block));
      };
      for (const child of root.getChildren()) {
        if ($isListNode(child)) for (const item of child.getChildren()) consider(item);
        else consider(child);
      }
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
  };
  useRegistration(() =>
    mergeRegister(editor.registerUpdateListener(mark), editor.registerEditableListener(mark)),
  );
  return null;
}

function BlockHandles(props: {
  cls: Slots;
  blocks: readonly AnyBlock[];
  images: boolean;
  tables: boolean;
}) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const [active, setActive] = editorSignal<ActiveBlock | null>(null);
  const [menu, setMenu] = createSignal(false, { ownedWrite: true });
  const [picker, setPicker] = createSignal(false, { ownedWrite: true });
  const [drop, setDrop] = createSignal<number | null>(null, { ownedWrite: true });
  const [scroller, setScroller] = editorSignal<HTMLElement | null>(null);
  let dragged = false;
  let pinned = false;

  const measure = (key: NodeKey): ActiveBlock | null => {
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
        text: $textBlockOf(node),
      };
    });
  };

  const follow = (key: NodeKey | null): void => {
    if (pinned) return;
    setActive(key === null ? null : measure(key));
  };

  const caretBlock = (): NodeKey | null =>
    editor.read(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection)
        ? (selection.anchor.getNode().getTopLevelElement()?.getKey() ?? null)
        : null;
    });

  const blockAt = (y: number): { key: NodeKey; index: number } | null => {
    const keys = editor.read(() => $getRoot().getChildrenKeys());
    for (const [index, key] of keys.entries()) {
      const box = editor.getElementByKey(key)?.getBoundingClientRect();
      if (box !== undefined && y >= box.top && y <= box.bottom) return { key, index };
    }
    return null;
  };

  const dropIndex = (y: number): number => {
    const keys = editor.read(() => $getRoot().getChildrenKeys());
    for (const [index, key] of keys.entries()) {
      const box = editor.getElementByKey(key)?.getBoundingClientRect();
      if (box !== undefined && y < box.top + box.height / 2) return index;
    }
    return keys.length;
  };

  const move = (step: -1 | 1): void => {
    const current = active();
    if (current === null) return;
    moveBlock(editor, current.key, step, (position, count) =>
      announce(messages().blockMoved(position, count), "polite"),
    );
    follow(current.key);
  };

  useRegistration(() =>
    mergeRegister(
      editor.registerUpdateListener(() => {
        const current = active();
        follow(pinned && current !== null ? current.key : (caretBlock() ?? current?.key ?? null));
      }),
      editor.registerRootListener((root, previous) => {
        const onPointer = (event: PointerEvent): void => {
          if (event.pointerType === "touch") return;
          const found = blockAt(event.clientY);
          if (found !== null) follow(found.key);
        };
        previous?.removeEventListener("pointermove", onPointer);
        root?.addEventListener("pointermove", onPointer);
        setScroller(root?.parentElement ?? null);
      }),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          const mod = event.metaKey || event.ctrlKey;
          if (mod && event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            const key = caretBlock();
            if (key === null) return false;
            event.preventDefault();
            follow(key);
            move(event.key === "ArrowUp" ? -1 : 1);
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
    editorCommands(messages(), {
      blocks: props.blocks,
      images: props.images,
      tables: props.tables,
    }),
  );
  const groups = createMemo(() => {
    const out = new Map<string, SlashCommand[]>();
    for (const command of commands()) {
      const group = command.group ?? "";
      out.set(group, [...(out.get(group) ?? []), command]);
    }
    return [...out.entries()];
  });

  const onGripDown = (event: PointerEvent): void => {
    const current = active();
    if (current === null || event.button !== 0) return;
    const grip = event.currentTarget as HTMLElement;
    const startY = event.clientY;
    dragged = false;
    pinned = true;
    const onMove = (next: PointerEvent): void => {
      if (!dragged && Math.abs(next.clientY - startY) < 6) return;
      dragged = true;
      setDrop(dropIndex(next.clientY));
    };
    const onUp = (): void => {
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
  };

  // Before the button's own press handling, which keeps the events to itself.
  const gripKeys = (element: HTMLSpanElement): (() => void) => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      event.preventDefault();
      event.stopPropagation();
      move(event.key === "ArrowUp" ? -1 : 1);
    };
    element.addEventListener("pointerdown", onGripDown, true);
    element.addEventListener("keydown", onKey, true);
    return () => {
      element.removeEventListener("pointerdown", onGripDown, true);
      element.removeEventListener("keydown", onKey, true);
    };
  };

  const indicatorTop = (): number | null => {
    const index = drop();
    const body = scroller();
    if (index === null || body === null) return null;
    const keys = editor.read(() => $getRoot().getChildrenKeys());
    const key = keys[Math.min(index, keys.length - 1)];
    const box = key === undefined ? null : editor.getElementByKey(key)?.getBoundingClientRect();
    if (box === null || box === undefined) return null;
    const bodyTop = body.getBoundingClientRect().top - body.scrollTop;
    return (index >= keys.length ? box.bottom : box.top) - bodyTop;
  };

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
                <Popover isOpen={picker()} onOpenChange={setPicker}>
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
                      <CommandInput placeholder={messages().searchBlocks} />
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
                      <Show when={current().text !== null}>
                        <DropdownMenuLabel>{messages().turnInto}</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={current().text ?? ""}
                          onValueChange={(value: string) => {
                            editor.update(() => $getNodeByKey(current().key)?.selectStart());
                            setTextBlock(editor, value as TextBlockType);
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
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator />
                      </Show>
                      <DropdownMenuItem onSelect={() => duplicate(editor, current().key)}>
                        {messages().duplicate}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        isDisabled={current().index === 0}
                        onSelect={() => move(-1)}
                      >
                        {messages().moveUp}
                        <span aria-hidden="true">{shortcutLabel("Mod+Shift+↑")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        isDisabled={current().index >= current().count - 1}
                        onSelect={() => move(1)}
                      >
                        {messages().moveDown}
                        <span aria-hidden="true">{shortcutLabel("Mod+Shift+↓")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => remove(editor, current().key)}
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
