import { type Child, For, Show, createMemo } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key } from "@barqjs/aria/collections";
import { overflowItems } from "@barqjs/aria/overflow";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { useLexicalEditor, useLexicalEditable, useLexicalEditorState } from "@barqjs/lexical";
import { Bold } from "@barqjs/lucide/icons/bold";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Code } from "@barqjs/lucide/icons/code";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { IndentDecrease } from "@barqjs/lucide/icons/indent-decrease";
import { IndentIncrease } from "@barqjs/lucide/icons/indent-increase";
import { Italic } from "@barqjs/lucide/icons/italic";
import { Link } from "@barqjs/lucide/icons/link";
import { List } from "@barqjs/lucide/icons/list";
import { ListChecks } from "@barqjs/lucide/icons/list-checks";
import { ListOrdered } from "@barqjs/lucide/icons/list-ordered";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Quote } from "@barqjs/lucide/icons/quote";
import { Redo2 } from "@barqjs/lucide/icons/redo-2";
import { SquareCode } from "@barqjs/lucide/icons/square-code";
import { Strikethrough } from "@barqjs/lucide/icons/strikethrough";
import { TextAlignCenter } from "@barqjs/lucide/icons/text-align-center";
import { TextAlignEnd } from "@barqjs/lucide/icons/text-align-end";
import { TextAlignJustify } from "@barqjs/lucide/icons/text-align-justify";
import { TextAlignStart } from "@barqjs/lucide/icons/text-align-start";
import { Underline } from "@barqjs/lucide/icons/underline";
import { Undo2 } from "@barqjs/lucide/icons/undo-2";
import { Button } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import {
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  type ElementFormatType,
  REDO_COMMAND,
  UNDO_COMMAND,
  mergeRegister,
} from "lexical";

import { IconButton } from "../components/icon-button.tsx";
import { type ArcMessages, useArcMessages } from "../components/messages.ts";
import { Toolbar, ToolbarSeparator } from "../components/toolbar.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, gap, glyph, layout, space } from "../style/index.ts";
import {
  $selectionFormat,
  type Mark,
  OPEN_LINK_EDITOR_COMMAND,
  type SelectionFormat,
  TEXT_BLOCK_TYPES,
  type TextBlockType,
  indent,
  setAlignment,
  setTextBlock,
  shortcutLabel,
  textBlockLabel,
  toggleMark,
} from "./commands.ts";
import { labelOf } from "./blocks.tsx";
import { type EditorToolbarItem, editorExtensions } from "./extension.ts";
import { editorSignal, useRegistration } from "./hooks.ts";

/** A group of the toolbar's controls, which goes into the More menu whole. */
export type EditorTool =
  | "history"
  | "textStyle"
  | "marks"
  | "link"
  | "lists"
  | "blocks"
  | "alignment"
  | "indent"
  | "insert";

export const DEFAULT_TOOLS: readonly EditorTool[] = [
  "history",
  "textStyle",
  "marks",
  "link",
  "lists",
  "blocks",
  "alignment",
  "indent",
  "insert",
];

/** What stays out of the More menu longest as the toolbar narrows: the highest go last. */
const PRIORITY: Record<EditorTool, number> = {
  marks: 9,
  textStyle: 8,
  link: 7,
  lists: 6,
  history: 5,
  insert: 4,
  blocks: 3,
  alignment: 2,
  indent: 1,
};

/** Something the Insert menu offers: a table, an image, an app's block. */
export interface InsertAction {
  id: string;
  label: string;
  icon?: () => Child;
  onInsert: () => void;
}

export const editorToolbarStyles = variants({
  slots: {
    root: arc(edge.bottom, layout.minZero, { padding: space.x1 }),
    room: arc(layout.grow, layout.minZero, { overflow: "hidden" }),
    row: arc(layout.row, gap[0.5], layout.nowrap),
    group: arc(layout.inlineRow, gap[0.5], layout.noShrink),
    textStyle: arc(gap[1], { justifyContent: "space-between", minInlineSize: "8.5rem" }),
    chevron: arc(glyph.sm),
    more: arc(layout.noShrink),
  },
});

type Slots = ReturnType<typeof editorToolbarStyles>;

export interface EditorToolbarProps extends Customisable<Slots> {
  /** The groups shown, in order. @default every one */
  tools?: readonly EditorTool[];
  /** What the Insert menu offers. Its group is left out when there is nothing. */
  insert?: readonly InsertAction[];
  /** Names the toolbar. @default arc's "Formatting" */
  "aria-label"?: string;
}

/** The selection's format, followed through every update of the editor in scope. */
export function useSelectionFormat(): () => SelectionFormat {
  return useLexicalEditorState($selectionFormat);
}

/** Whether there is something to undo and to redo, from whichever history the editor has. */
export function useHistoryState(): { canUndo: () => boolean; canRedo: () => boolean } {
  const editor = useLexicalEditor();
  const [canUndo, setCanUndo] = editorSignal(false);
  const [canRedo, setCanRedo] = editorSignal(false);
  useRegistration(() =>
    mergeRegister(
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (value) => {
          setCanUndo(value);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (value) => {
          setCanRedo(value);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    ),
  );
  return { canUndo, canRedo };
}

const MARK_ICONS: Record<Mark, () => Child> = {
  bold: () => <Bold />,
  italic: () => <Italic />,
  underline: () => <Underline />,
  strikethrough: () => <Strikethrough />,
  code: () => <Code />,
};

const MARK_SHORTCUTS: Record<Mark, string> = {
  bold: "Mod+B",
  italic: "Mod+I",
  underline: "Mod+U",
  strikethrough: "Mod+Shift+X",
  code: "Mod+E",
};

export function markLabel(mark: Mark, messages: ArcMessages): string {
  return mark === "code" ? messages.inlineCode : messages[mark];
}

export function markShortcut(mark: Mark): string {
  return shortcutLabel(MARK_SHORTCUTS[mark]);
}

export function markIcon(mark: Mark): Child {
  return MARK_ICONS[mark]();
}

interface BlockButton {
  type: TextBlockType;
  icon: () => Child;
}

const LISTS: readonly BlockButton[] = [
  { type: "bullet", icon: () => <List /> },
  { type: "number", icon: () => <ListOrdered /> },
  { type: "check", icon: () => <ListChecks /> },
];

const BLOCKS: readonly BlockButton[] = [
  { type: "quote", icon: () => <Quote /> },
  { type: "code", icon: () => <SquareCode /> },
];

const ALIGNMENTS: readonly {
  value: ElementFormatType;
  label: (messages: ArcMessages) => string;
  icon: () => Child;
}[] = [
  { value: "start", label: (m) => m.alignStart, icon: () => <TextAlignStart /> },
  { value: "center", label: (m) => m.alignCenter, icon: () => <TextAlignCenter /> },
  { value: "end", label: (m) => m.alignEnd, icon: () => <TextAlignEnd /> },
  { value: "justify", label: (m) => m.justify, icon: () => <TextAlignJustify /> },
];

/** `left` and `right` are where a document written elsewhere put its text; here they read as the start and end. */
function alignmentOf(format: ElementFormatType, rtl: boolean): ElementFormatType {
  if (format === "" || format === "start") return "start";
  if (format === "left") return rtl ? "end" : "start";
  if (format === "right") return rtl ? "start" : "end";
  return format;
}

/**
 * The editor's toolbar: undo and redo, the text style, the marks, a link,
 * lists, a quote and a code block, alignment, indent and what to insert,
 * each showing what the selection already is.
 *
 * On arc's `Toolbar`: one Tab stop, the arrows moving in the reading
 * direction. As it narrows, whole groups move into a More menu, the least
 * used first, so a phone keeps the marks and the text style in reach.
 */
export function EditorToolbar(props: EditorToolbarProps) {
  const editor = useLexicalEditor();
  const editable = useLexicalEditable();
  const messages = useArcMessages();
  const format = useSelectionFormat();
  const history = useHistoryState();
  const cls = (): Slots => parts(editorToolbarStyles(), props.classes);
  const extra = editorExtensions(editor).flatMap((extension) => extension.toolbar ?? []);
  const extraById = new Map(extra.map((item) => [`extension:${item.id}`, item]));
  const tools = createMemo((): string[] => [
    ...(props.tools ?? DEFAULT_TOOLS).filter(
      (tool) => tool !== "insert" || (props.insert?.length ?? 0) > 0,
    ),
    ...extraById.keys(),
  ]);

  const wrapperRef = makeRef<HTMLDivElement>();
  const groupRef = makeRef<HTMLDivElement>();
  const { hidden } = overflowItems({
    wrapperRef,
    groupRef,
    isCollapsing: () => true,
    orientation: () => "horizontal",
    keys: tools,
    priority: (key: Key) =>
      PRIORITY[key as EditorTool] ?? extraById.get(String(key))?.priority ?? 2,
  });
  const shown = (): string[] => tools().filter((tool) => !hidden().has(tool));
  const folded = (): string[] => tools().filter((tool) => hidden().has(tool));

  const block = (): TextBlockType | null => format().block;
  const align = (): ElementFormatType => alignmentOf(format().align, format().rtl);
  const disabled = (): boolean => !editable();
  const run = (action: () => void): void => {
    action();
    editor.focus();
  };

  const textStyleLabel = (): string => {
    const current = block();
    return current === null ? messages().textStyle : textBlockLabel(current, messages());
  };

  const group = (tool: string, index: () => number): Child => (
    <div class={cls().group} data-slot="editor-toolbar-group" data-tool={tool}>
      <Show when={index() > 0}>
        <ToolbarSeparator />
      </Show>
      {extraById.has(tool) ? (
        <ExtensionTool item={extraById.get(tool)!} disabled={disabled()} />
      ) : tool === "history" ? (
        <>
          <IconButton
            label={messages().undo}
            shortcut={shortcutLabel("Mod+Z")}
            size="sm"
            isDisabled={disabled() || !history.canUndo()}
            onPress={() => run(() => editor.dispatchCommand(UNDO_COMMAND, undefined))}
          >
            <Undo2 />
          </IconButton>
          <IconButton
            label={messages().redo}
            shortcut={shortcutLabel("Mod+Shift+Z")}
            size="sm"
            isDisabled={disabled() || !history.canRedo()}
            onPress={() => run(() => editor.dispatchCommand(REDO_COMMAND, undefined))}
          >
            <Redo2 />
          </IconButton>
        </>
      ) : tool === "textStyle" ? (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              size="sm"
              class={cls().textStyle}
              data-slot="editor-text-style"
              aria-label={`${messages().textStyle}: ${textStyleLabel()}`}
              isDisabled={disabled()}
            >
              <span>{textStyleLabel()}</span>
              <ChevronDown class={cls().chevron} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label={messages().textStyle} align="start">
            <TextStyleItems
              current={block()}
              onChoose={(type) => run(() => setTextBlock(editor, type))}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : tool === "marks" ? (
        <For each={["bold", "italic", "underline", "strikethrough", "code"] as Mark[]}>
          {(mark: Mark) => (
            <IconButton
              label={markLabel(mark, messages())}
              shortcut={markShortcut(mark)}
              size="sm"
              isPressed={format().marks[mark]}
              isDisabled={disabled()}
              onPress={() => run(() => toggleMark(editor, mark))}
            >
              {markIcon(mark)}
            </IconButton>
          )}
        </For>
      ) : tool === "link" ? (
        <IconButton
          label={messages().link}
          shortcut={shortcutLabel("Mod+K")}
          size="sm"
          isPressed={format().link !== null}
          isDisabled={disabled()}
          onPress={() => editor.dispatchCommand(OPEN_LINK_EDITOR_COMMAND, undefined)}
        >
          <Link />
        </IconButton>
      ) : tool === "lists" || tool === "blocks" ? (
        <For each={tool === "lists" ? LISTS : BLOCKS}>
          {(item: BlockButton) => (
            <IconButton
              label={textBlockLabel(item.type, messages())}
              size="sm"
              isPressed={block() === item.type}
              isDisabled={disabled()}
              onPress={() => run(() => setTextBlock(editor, item.type, block()))}
            >
              {item.icon()}
            </IconButton>
          )}
        </For>
      ) : tool === "alignment" ? (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={messages().alignment}
              data-slot="editor-alignment"
              isDisabled={disabled()}
            >
              {(ALIGNMENTS.find((one) => one.value === align()) ?? ALIGNMENTS[0])?.icon()}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label={messages().alignment} align="start">
            <AlignmentItems
              current={align()}
              onChoose={(value) => run(() => setAlignment(editor, value))}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : tool === "indent" ? (
        <>
          <IconButton
            label={messages().outdent}
            size="sm"
            isDisabled={disabled()}
            onPress={() => run(() => indent(editor, "out"))}
          >
            <IndentDecrease />
          </IconButton>
          <IconButton
            label={messages().indent}
            size="sm"
            isDisabled={disabled()}
            onPress={() => run(() => indent(editor, "in"))}
          >
            <IndentIncrease />
          </IconButton>
        </>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={messages().insert}
              data-slot="editor-insert"
              isDisabled={disabled()}
            >
              <Plus aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label={messages().insert} align="start">
            <For each={props.insert ?? []}>
              {(action: InsertAction) => (
                <DropdownMenuItem onSelect={() => action.onInsert()}>
                  {action.icon?.()}
                  {action.label}
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  return (
    <Toolbar
      aria-label={props["aria-label"] ?? messages().formatting}
      class={arc(cls().root, props.class, props.className)}
    >
      <div ref={wrapperRef.set} class={cls().room} data-slot="editor-toolbar">
        <div ref={groupRef.set} class={cls().row}>
          <For each={shown()}>{(tool: string, index: () => number) => group(tool, index)}</For>
          <Show when={folded().length > 0}>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class={cls().more}
                  aria-label={messages().moreOptions}
                  data-slot="editor-toolbar-more"
                  isDisabled={disabled()}
                >
                  <Ellipsis aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent aria-label={messages().formatting} align="end">
                <For each={folded()}>
                  {(tool: string, index: () => number) => (
                    <>
                      <Show when={index() > 0}>
                        <DropdownMenuSeparator />
                      </Show>
                      <FoldedTool
                        tool={tool}
                        item={extraById.get(tool)}
                        format={format()}
                        align={align()}
                        canUndo={history.canUndo()}
                        canRedo={history.canRedo()}
                        insert={props.insert ?? []}
                        run={run}
                      />
                    </>
                  )}
                </For>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>
        </div>
      </div>
    </Toolbar>
  );
}

function TextStyleItems(props: {
  current: TextBlockType | null;
  onChoose: (type: TextBlockType) => void;
}) {
  const messages = useArcMessages();
  return (
    <DropdownMenuRadioGroup
      value={props.current ?? ""}
      onValueChange={(value: string) => props.onChoose(value as TextBlockType)}
    >
      <For each={TEXT_BLOCK_TYPES}>
        {(type: TextBlockType) => (
          <DropdownMenuRadioItem value={type}>
            {textBlockLabel(type, messages())}
          </DropdownMenuRadioItem>
        )}
      </For>
    </DropdownMenuRadioGroup>
  );
}

function AlignmentItems(props: {
  current: ElementFormatType;
  onChoose: (value: ElementFormatType) => void;
}) {
  const messages = useArcMessages();
  return (
    <DropdownMenuRadioGroup
      value={props.current}
      onValueChange={(value: string) => props.onChoose(value as ElementFormatType)}
    >
      <For each={ALIGNMENTS}>
        {(item: (typeof ALIGNMENTS)[number]) => (
          <DropdownMenuRadioItem value={item.value}>{item.label(messages())}</DropdownMenuRadioItem>
        )}
      </For>
    </DropdownMenuRadioGroup>
  );
}

/** An extension's button, pressed as its `$pressed` reads the selection. */
function ExtensionTool(props: { item: EditorToolbarItem; disabled: boolean }) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const pressed = useLexicalEditorState(() => props.item.$pressed?.() ?? false);
  return (
    <IconButton
      label={labelOf(props.item.label, messages())}
      shortcut={props.item.shortcut === undefined ? undefined : shortcutLabel(props.item.shortcut)}
      size="sm"
      isPressed={props.item.$pressed === undefined ? undefined : pressed()}
      isDisabled={props.disabled}
      onPress={() => props.item.run(editor)}
    >
      {props.item.icon()}
    </IconButton>
  );
}

/** A group that no longer fits, as menu items. */
function FoldedTool(props: {
  tool: string;
  item?: EditorToolbarItem;
  format: SelectionFormat;
  align: ElementFormatType;
  canUndo: boolean;
  canRedo: boolean;
  insert: readonly InsertAction[];
  run: (action: () => void) => void;
}) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const tool = props.tool;
  const extra = props.item;
  if (extra !== undefined) {
    return (
      <DropdownMenuItem onSelect={() => extra.run(editor)}>
        {extra.icon()}
        {labelOf(extra.label, messages())}
      </DropdownMenuItem>
    );
  }
  if (tool === "history") {
    return (
      <>
        <DropdownMenuItem
          isDisabled={!props.canUndo}
          onSelect={() => props.run(() => editor.dispatchCommand(UNDO_COMMAND, undefined))}
        >
          {messages().undo}
        </DropdownMenuItem>
        <DropdownMenuItem
          isDisabled={!props.canRedo}
          onSelect={() => props.run(() => editor.dispatchCommand(REDO_COMMAND, undefined))}
        >
          {messages().redo}
        </DropdownMenuItem>
      </>
    );
  }
  if (tool === "textStyle") {
    return (
      <>
        <DropdownMenuLabel>{messages().textStyle}</DropdownMenuLabel>
        <TextStyleItems
          current={props.format.block}
          onChoose={(type) => props.run(() => setTextBlock(editor, type))}
        />
      </>
    );
  }
  if (tool === "alignment") {
    return (
      <>
        <DropdownMenuLabel>{messages().alignment}</DropdownMenuLabel>
        <AlignmentItems
          current={props.align}
          onChoose={(value) => props.run(() => setAlignment(editor, value))}
        />
      </>
    );
  }
  if (tool === "marks") {
    return (
      <For each={["bold", "italic", "underline", "strikethrough", "code"] as Mark[]}>
        {(mark: Mark) => (
          <DropdownMenuCheckboxItem
            checked={props.format.marks[mark]}
            onCheckedChange={() => props.run(() => toggleMark(editor, mark))}
          >
            {markLabel(mark, messages())}
          </DropdownMenuCheckboxItem>
        )}
      </For>
    );
  }
  if (tool === "lists" || tool === "blocks") {
    return (
      <For each={tool === "lists" ? LISTS : BLOCKS}>
        {(item: BlockButton) => (
          <DropdownMenuCheckboxItem
            checked={props.format.block === item.type}
            onCheckedChange={() =>
              props.run(() => setTextBlock(editor, item.type, props.format.block))
            }
          >
            {textBlockLabel(item.type, messages())}
          </DropdownMenuCheckboxItem>
        )}
      </For>
    );
  }
  if (tool === "link") {
    return (
      <DropdownMenuItem
        onSelect={() => editor.dispatchCommand(OPEN_LINK_EDITOR_COMMAND, undefined)}
      >
        {messages().link}
      </DropdownMenuItem>
    );
  }
  if (tool === "indent") {
    return (
      <>
        <DropdownMenuItem onSelect={() => props.run(() => indent(editor, "out"))}>
          {messages().outdent}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.run(() => indent(editor, "in"))}>
          {messages().indent}
        </DropdownMenuItem>
      </>
    );
  }
  return (
    <For each={props.insert}>
      {(action: InsertAction) => (
        <DropdownMenuItem onSelect={() => action.onInsert()}>{action.label}</DropdownMenuItem>
      )}
    </For>
  );
}
