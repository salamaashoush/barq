import { For, Show, createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Popover as AriaPopover } from "@barqjs/aria/dialog";
import { useLocale } from "@barqjs/aria/i18n";
import {
  type AnchorRect,
  overlayPosition,
  portalContainer,
  usePortalTarget,
} from "@barqjs/aria/overlays";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { mediaQuery } from "@barqjs/primitives/media";
import { useLexicalEditor, useLexicalEditorState } from "@barqjs/lexical";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Copy } from "@barqjs/lucide/icons/copy";
import { ExternalLink } from "@barqjs/lucide/icons/external-link";
import { Link } from "@barqjs/lucide/icons/link";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { Unlink } from "@barqjs/lucide/icons/unlink";
import { Button } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@barqjs/ui/field";
import { Input } from "@barqjs/ui/input";
import { Portal } from "@barqjs/web";
import { $isCodeNode } from "@lexical/code-core";
import { formatUrl } from "@lexical/link";
import { $findMatchingParent } from "@lexical/utils";
import {
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  SELECTION_CHANGE_COMMAND,
  mergeRegister,
} from "lexical";

import { IconButton } from "../components/icon-button.tsx";
import { useArcMessages } from "../components/messages.ts";
import { Toolbar, ToolbarSeparator } from "../components/toolbar.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  fg,
  gap,
  glyph,
  layout,
  rounded,
  space,
  surface,
  truncate,
  type,
  zIndex,
} from "../style/index.ts";
import {
  $turnInto,
  MARKS,
  type Mark,
  OPEN_LINK_EDITOR_COMMAND,
  TEXT_BLOCK_TYPES,
  type TextBlockType,
  duplicateBlock,
  editorConversions,
  removeBlock,
  setLink,
  setTextBlock,
  shortcutLabel,
  textBlockLabel,
  toggleMark,
} from "./commands.ts";
import { $rootBlockOf } from "./containers.tsx";
import { labelOf } from "./blocks.tsx";
import { isSafeUrl } from "./document.ts";
import { type BlockConversion, type EditorToolbarItem, editorExtensions } from "./extension.ts";
import { editorSignal, useRegistration } from "./hooks.ts";
import { markIcon, markLabel, markShortcut, useSelectionFormat } from "./toolbar.tsx";

export const floatingStyles = variants({
  slots: {
    bar: arc({ zIndex: zIndex.popover, maxWidth: "calc(100vw - 1rem)" }),
    turnInto: arc(gap[1], { justifyContent: "space-between", minInlineSize: "7rem" }),
    chevron: arc(glyph.sm),
    popover: arc(surface.elevated, rounded.lg, { zIndex: zIndex.popover, outline: "none" }),
    linkText: arc(type.meta, fg.link, truncate, { maxWidth: "16rem", paddingInline: space.x2 }),
    form: arc(layout.column, gap[3], {
      padding: space.x3,
      minWidth: "min(20rem, calc(100vw - 2rem))",
    }),
    actions: arc(layout.row, layout.end, gap[2]),
  },
});

type Slots = ReturnType<typeof floatingStyles>;

/** Where the editor's DOM selection is on screen, or `null` when it is not in the editor. */
export function selectionRect(editor: LexicalEditor): AnchorRect | null {
  const root = editor.getRootElement();
  const selection = root?.ownerDocument.defaultView?.getSelection() ?? null;
  if (root === null || selection === null || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const rects = range.getClientRects();
  const box = rects.length > 0 ? rects[0]! : range.getBoundingClientRect();
  const whole = range.getBoundingClientRect();
  return {
    top: whole.height > 0 ? whole.top : box.top,
    left: whole.width > 0 ? whole.left : box.left,
    width: whole.width,
    height: whole.height > 0 ? whole.height : box.height,
  };
}

export interface FloatingFormatToolbarProps extends Customisable<Slots> {
  /** The marks it offers. @default every one */
  marks?: readonly Mark[];
  /** A link button. @default true */
  link?: boolean;
  /** A Turn into menu at its start. @default true */
  turnInto?: boolean;
}

/** What the bar is over: words selected, or a block chosen whole. */
type BarMode = "text" | "block";

/** What the selection gives the bar to stand over: words, or a block by its key. */
interface BarTarget {
  mode: BarMode;
  key: NodeKey | null;
}

interface BarPlace {
  mode: BarMode;
  rect: AnchorRect;
  /** The chosen block's key, in block mode. */
  block: NodeKey | null;
}

function rectOf(element: Element): AnchorRect {
  const box = element.getBoundingClientRect();
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

/**
 * The marks and a link over the text a reader selects, with Turn into at
 * its start and what the editor's extensions add after (colours, sizes,
 * clear formatting in a document), and over a block chosen whole its
 * Duplicate and Delete. It stays away from a code block, where formatting
 * means nothing, and from a selection still being drawn by a pressed
 * pointer, coming back once it is let go.
 *
 * Placed with aria's positioning against the selection's box: above it,
 * flipping below near the top of the screen, and below it on a touch screen
 * where the system's own selection menu sits above. It takes no focus, so
 * typing goes on; Alt+F10, or Tab on a chosen block, moves into it and
 * Escape back out.
 */
export function FloatingFormatToolbar(props: FloatingFormatToolbarProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const locale = useLocale();
  const format = useSelectionFormat();
  const coarse = mediaQuery("(pointer: coarse)");
  function cls(): Slots {
    return parts(floatingStyles(), props.classes);
  }
  const [place, setPlace] = editorSignal<BarPlace | null>(null);
  const [dismissed, setDismissed] = editorSignal(false);
  // Read where it is written, so a plain flag rather than a staged signal.
  let pressed = false;
  const barRef = makeRef<HTMLDivElement>();
  const target = usePortalTarget();
  const extensions = editorExtensions(editor);
  const extra = extensions.flatMap((extension) => extension.floating ?? []);
  const conversions = editorConversions(extensions);

  function read(): void {
    const active = editor.getRootElement()?.ownerDocument.activeElement ?? null;
    const inBar = active !== null && (barRef()?.contains(active) ?? false);
    if (inBar || pressed) return;
    const found = editor.read((): BarTarget | null => {
      const selection = $getSelection();
      if (!editor.isEditable()) return null;
      if ($isNodeSelection(selection)) {
        const [node] = selection.getNodes();
        return selection.getNodes().length === 1 && node !== undefined && node.getParent() !== null
          ? { mode: "block", key: node.getKey() }
          : null;
      }
      if (!$isRangeSelection(selection) || selection.isCollapsed()) return null;
      if (selection.getTextContent().trim() === "") return null;
      const inCode = selection
        .getNodes()
        .some((node) => $findMatchingParent(node, $isCodeNode) !== null);
      return inCode ? null : { mode: "text", key: null };
    });
    if (found === null) {
      setPlace(null);
      return;
    }
    if (found.mode === "text" || found.key === null) {
      const rect = selectionRect(editor);
      setPlace(rect === null ? null : { mode: "text", rect, block: null });
      return;
    }
    const element = editor.getElementByKey(found.key);
    setPlace(element === null ? null : { mode: "block", rect: rectOf(element), block: found.key });
  }

  function enter(event: KeyboardEvent): boolean {
    if (place() === null || dismissed()) return false;
    const first = barRef()?.querySelector<HTMLElement>("button:not([disabled])");
    if (first === null || first === undefined) return false;
    event.preventDefault();
    first.focus();
    return true;
  }

  useRegistration(() =>
    mergeRegister(
      editor.registerUpdateListener(
        ({ editorState, prevEditorState, dirtyElements, dirtyLeaves }) => {
          // Escape keeps it away until the text or the selection changes; focus
          // coming back to the text is neither.
          const now = editorState.read(() => $getSelection());
          const before = prevEditorState.read(() => $getSelection());
          const moved = now === null || before === null ? now !== before : !now.is(before);
          if (moved || dirtyElements.size > 0 || dirtyLeaves.size > 0) setDismissed(false);
          read();
        },
      ),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          read();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (place() === null || dismissed()) return false;
          setDismissed(true);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => !event.shiftKey && place()?.mode === "block" && enter(event),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerRootListener((root, previous) => {
        function onKey(event: KeyboardEvent): void {
          if (event.key === "F10" && event.altKey) enter(event);
        }
        function onDown(event: PointerEvent): void {
          if (event.button !== 0) return;
          pressed = true;
          setPlace(null);
          root?.ownerDocument.addEventListener("pointerup", onUp, { once: true });
        }
        function onUp(): void {
          pressed = false;
          read();
        }
        previous?.removeEventListener("keydown", onKey);
        previous?.removeEventListener("pointerdown", onDown);
        root?.addEventListener("keydown", onKey);
        root?.addEventListener("pointerdown", onDown);
      }),
    ),
  );

  function open(): boolean {
    return place() !== null && !dismissed();
  }
  const position = overlayPosition({
    targetRef: () => editor.getRootElement(),
    targetRect: () => place()?.rect ?? null,
    overlayRef: barRef,
    placement: () => (coarse() ? "bottom" : "top"),
    offset: () => 8,
    isOpen: open,
    direction: () => locale().direction,
  });

  function back(): void {
    setDismissed(true);
    editor.focus();
  }

  function kind(): string {
    return editor.read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return "";
      const block = $rootBlockOf(selection.anchor.getNode());
      const own = block === null ? undefined : conversions.find((one) => one.$is(block));
      return own?.id ?? format().block ?? "";
    });
  }

  function turn(value: string): void {
    const conversion = conversions.find((one) => one.id === value);
    if (conversion === undefined) {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const block = $rootBlockOf(selection.anchor.getNode());
        // Out of a callout or a toggle first, then the line takes the style.
        if (block !== null && conversions.some((one) => one.$is(block))) {
          $turnInto(block, value, conversions);
        }
      });
      if (TEXT_BLOCK_TYPES.some((one) => one === value))
        setTextBlock(editor, value as TextBlockType);
    } else {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const block = $rootBlockOf(selection.anchor.getNode());
        if (
          block !== null &&
          $findMatchingParent(selection.anchor.getNode(), $isTableCell) === null
        ) {
          $turnInto(block, value, conversions);
        }
      });
    }
    editor.focus();
  }

  return (
    <Show when={open()}>
      <Portal mount={portalContainer(target)}>
        <div
          {...position.overlayProps}
          ref={barRef.set}
          class={arc(cls().bar, props.class, props.className)}
          data-slot="floating-format-toolbar"
          data-mode={place()?.mode}
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === "Escape") {
              event.preventDefault();
              back();
            }
          }}
        >
          <Show
            when={place()?.mode === "text"}
            fallback={
              <Toolbar variant="floating" aria-label={messages().blockToolbar}>
                <IconButton
                  label={messages().duplicate}
                  shortcut={shortcutLabel("Mod+D")}
                  size="sm"
                  onPress={() => {
                    const key = place()?.block;
                    if (key !== null && key !== undefined) duplicateBlock(editor, key);
                    editor.focus();
                  }}
                >
                  <Copy />
                </IconButton>
                <IconButton
                  label={messages().delete}
                  size="sm"
                  onPress={() => {
                    const key = place()?.block;
                    if (key !== null && key !== undefined) removeBlock(editor, key);
                    editor.focus();
                  }}
                >
                  <Trash2 />
                </IconButton>
              </Toolbar>
            }
          >
            <Toolbar variant="floating" aria-label={messages().formatting}>
              <Show when={props.turnInto !== false}>
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Button
                      variant="ghost"
                      size="sm"
                      class={cls().turnInto}
                      data-slot="floating-turn-into"
                      aria-label={messages().turnInto}
                    >
                      <span>
                        {format().block === null
                          ? messages().turnInto
                          : textBlockLabel(format().block!, messages())}
                      </span>
                      <ChevronDown class={cls().chevron} aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent aria-label={messages().turnInto} align="start">
                    <DropdownMenuRadioGroup value={kind()} onValueChange={turn}>
                      <For each={TEXT_BLOCK_TYPES}>
                        {(style: TextBlockType) => (
                          <DropdownMenuRadioItem value={style}>
                            {textBlockLabel(style, messages())}
                          </DropdownMenuRadioItem>
                        )}
                      </For>
                      <Show when={!format().inTable}>
                        <For each={conversions}>
                          {(conversion: BlockConversion) => (
                            <DropdownMenuRadioItem value={conversion.id}>
                              {labelOf(conversion.label, messages())}
                            </DropdownMenuRadioItem>
                          )}
                        </For>
                      </Show>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <ToolbarSeparator />
              </Show>
              <For each={props.marks ?? MARKS}>
                {(mark: Mark) => (
                  <IconButton
                    label={markLabel(mark, messages())}
                    shortcut={markShortcut(mark)}
                    size="sm"
                    isPressed={format().marks[mark]}
                    onPress={() => toggleMark(editor, mark)}
                  >
                    {markIcon(mark)}
                  </IconButton>
                )}
              </For>
              <Show when={props.link !== false}>
                <IconButton
                  label={messages().link}
                  shortcut={shortcutLabel("Mod+K")}
                  size="sm"
                  isPressed={format().link !== null}
                  onPress={() => editor.dispatchCommand(OPEN_LINK_EDITOR_COMMAND, undefined)}
                >
                  <Link />
                </IconButton>
              </Show>
              <For each={extra}>{(item: EditorToolbarItem) => <FloatingItem item={item} />}</For>
            </Toolbar>
          </Show>
        </div>
      </Portal>
    </Show>
  );
}

function $isTableCell(node: LexicalNode): boolean {
  return node.getType() === "tablecell";
}

interface FloatingItemProps {
  item: EditorToolbarItem;
}

/** An extension's button over selected text, offered where its `$shown` reads true. */
function FloatingItem(props: FloatingItemProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const shown = useLexicalEditorState(() => props.item.$shown?.() ?? true);
  const pressed = useLexicalEditorState(() => props.item.$pressed?.() ?? false);
  const item = props.item;
  if (item.control !== undefined) {
    return (
      <Show when={shown()}>
        <item.control />
      </Show>
    );
  }
  return (
    <Show when={shown()}>
      <IconButton
        label={labelOf(props.item.label, messages())}
        shortcut={
          props.item.shortcut === undefined ? undefined : shortcutLabel(props.item.shortcut)
        }
        size="sm"
        isPressed={props.item.$pressed === undefined ? undefined : pressed()}
        onPress={() => item.run(editor)}
      >
        {props.item.icon()}
      </IconButton>
    </Show>
  );
}

export interface LinkEditorProps extends Customisable<Slots> {
  /** Whether an address may be linked. @default web, mail and phone addresses and paths */
  validateUrl?: (url: string) => boolean;
}

/**
 * The popover that puts a link on the selection or edits the one the caret
 * is in: Mod+K or the toolbar's Link opens it, an address is checked before
 * it is applied, and Remove takes the link off. While the caret rests in a
 * link it offers that link's address to open, edit or remove.
 */
export function LinkEditor(props: LinkEditorProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const locale = useLocale();
  const format = useSelectionFormat();
  function cls(): Slots {
    return parts(floatingStyles(), props.classes);
  }
  const inputId = createUniqueId();
  const errorId = createUniqueId();
  const [open, setOpen] = editorSignal(false);
  const [rect, setRect] = editorSignal<AnchorRect | null>(null);
  const [draft, setDraft] = createSignal("", { ownedWrite: true });
  const [invalid, setInvalid] = createSignal(false, { ownedWrite: true });
  const [caretRect, setCaretRect] = editorSignal<AnchorRect | null>(null);
  const previewRef = makeRef<HTMLDivElement>();
  const target = usePortalTarget();
  function valid(url: string): boolean {
    return (props.validateUrl ?? isSafeUrl)(url);
  }

  function begin(): boolean {
    const current = editor.read(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection) ? selection : null;
    });
    if (current === null || !editor.isEditable()) return false;
    setDraft(format().link ?? "");
    setInvalid(false);
    setRect(selectionRect(editor));
    setOpen(true);
    return true;
  }

  useRegistration(() =>
    mergeRegister(
      editor.registerCommand(OPEN_LINK_EDITOR_COMMAND, begin, COMMAND_PRIORITY_NORMAL),
      editor.registerRootListener((root, previous) => {
        function onKey(event: KeyboardEvent): void {
          if (event.key.toLowerCase() !== "k" || event.shiftKey || event.altKey) return;
          if (!(event.metaKey || event.ctrlKey)) return;
          if (begin()) event.preventDefault();
        }
        previous?.removeEventListener("keydown", onKey);
        root?.addEventListener("keydown", onKey);
      }),
      editor.registerUpdateListener(() => {
        const inLink = editor.read(() => {
          const selection = $getSelection();
          return $isRangeSelection(selection) && selection.isCollapsed();
        });
        setCaretRect(inLink && editor.isEditable() ? selectionRect(editor) : null);
      }),
    ),
  );

  function apply(): void {
    const url = formatUrl(draft().trim());
    if (!valid(url)) {
      setInvalid(true);
      return;
    }
    setOpen(false);
    setLink(editor, url);
    editor.focus();
  }

  function remove(): void {
    setOpen(false);
    setLink(editor, null);
    editor.focus();
  }

  function previewOpen(): boolean {
    return !open() && format().link !== null && caretRect() !== null;
  }
  const preview = overlayPosition({
    targetRef: () => editor.getRootElement(),
    targetRect: caretRect,
    overlayRef: previewRef,
    placement: () => "bottom",
    offset: () => 6,
    isOpen: previewOpen,
    direction: () => locale().direction,
  });

  return (
    <>
      <Show when={previewOpen()}>
        <Portal mount={portalContainer(target)}>
          <div
            {...preview.overlayProps}
            ref={previewRef.set}
            class={cls().bar}
            data-slot="link-preview"
          >
            <Toolbar variant="floating" aria-label={messages().link}>
              <a
                class={cls().linkText}
                href={format().link ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
              >
                {format().link}
              </a>
              <IconButton label={messages().openLink} size="sm" href={format().link ?? undefined}>
                <ExternalLink />
              </IconButton>
              <IconButton label={messages().editLink} size="sm" onPress={() => begin()}>
                <Pencil />
              </IconButton>
              <IconButton label={messages().removeLink} size="sm" onPress={remove}>
                <Unlink />
              </IconButton>
            </Toolbar>
          </div>
        </Portal>
      </Show>
      <AriaPopover
        isOpen={open()}
        onOpenChange={(next: boolean) => {
          setOpen(next);
          if (!next) editor.focus();
        }}
        triggerRef={() => editor.getRootElement()}
        triggerRect={rect()}
        placement="bottom start"
        aria-label={messages().editLink}
        class={arc(cls().popover, props.class, props.className)}
        data-slot="link-editor"
      >
        <form
          class={cls().form}
          onSubmit={(event: SubmitEvent) => {
            event.preventDefault();
            apply();
          }}
        >
          <Field isInvalid={invalid()}>
            <FieldLabel for={inputId}>{messages().linkAddress}</FieldLabel>
            <Input
              id={inputId}
              type="url"
              dir="ltr"
              inputMode="url"
              autoFocus
              value={draft()}
              placeholder={messages().linkPlaceholder}
              aria-invalid={invalid()}
              aria-errormessage={invalid() ? errorId : undefined}
              onInput={(event: Event) => {
                setDraft((event.currentTarget as HTMLInputElement).value);
                setInvalid(false);
              }}
            />
            <Show when={invalid()}>
              <FieldError id={errorId}>{messages().invalidLink}</FieldError>
            </Show>
          </Field>
          <div class={cls().actions}>
            <Show when={format().link !== null}>
              <Button type="button" variant="ghost" size="sm" onPress={remove}>
                {messages().removeLink}
              </Button>
            </Show>
            <Button type="button" size="sm" onPress={apply}>
              {messages().apply}
            </Button>
          </div>
        </form>
      </AriaPopover>
    </>
  );
}
