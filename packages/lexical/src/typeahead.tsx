import { Show, onCleanup } from "@barqjs/core";
import type { JSX } from "@barqjs/web";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type CommandListenerPriority,
  type LexicalEditor,
  type RangeSelection,
  getDOMSelection,
  getDOMSelectionPoints,
} from "lexical";

import { useLexicalEditor } from "./context.ts";
import { mirror } from "./hooks.ts";
import {
  LexicalMenu,
  type MenuRenderFn,
  type MenuResolution,
  type MenuTextMatch,
  type SelectOptionFn,
  type TriggerFn,
} from "./menu.tsx";
import type { MenuOption } from "./menu-option.ts";

/**
 * The punctuation that ends a typeahead query, as a character-class fragment:
 * the default `punctuation` of {@link basicTypeaheadTriggerMatch}.
 */
export const PUNCTUATION = "\\.,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%'\"~=<>_:;";

export interface BasicTriggerOptions {
  minLength?: number;
  maxLength?: number;
  punctuation?: string;
  allowWhitespace?: boolean;
}

/**
 * A trigger for the common case: one character such as `@`, `#` or `/` at the
 * start of a line or after whitespace or `(`, followed by `minLength` to
 * `maxLength` characters that are not punctuation (nor whitespace, unless
 * `allowWhitespace`).
 */
export function basicTypeaheadTriggerMatch(
  trigger: string,
  {
    minLength = 1,
    maxLength = 75,
    punctuation = PUNCTUATION,
    allowWhitespace = false,
  }: BasicTriggerOptions = {},
): TriggerFn {
  const validChars = `[^${trigger}${punctuation}${allowWhitespace ? "" : "\\s"}]`;
  const pattern = new RegExp(`(^|\\s|\\()([${trigger}]((?:${validChars}){0,${maxLength}}))$`);
  return (text) => {
    const match = pattern.exec(text);
    if (match === null) return null;
    const leading = match[1] ?? "";
    const matchingString = match[3] ?? "";
    if (matchingString.length < minLength) return null;
    return {
      leadOffset: match.index + leading.length,
      matchingString,
      replaceableString: match[2] ?? "",
    };
  };
}

function getTextUpToAnchor(selection: RangeSelection): string | null {
  const anchor = selection.anchor;
  if (anchor.type !== "text") return null;
  const anchorNode = anchor.getNode();
  if (!anchorNode.isSimpleText()) return null;
  return anchorNode.getTextContent().slice(0, anchor.offset);
}

function tryToPositionRange(
  leadOffset: number,
  range: Range,
  editorWindow: Window,
  rootElement: HTMLElement | null,
): boolean {
  const domSelection = getDOMSelection(editorWindow);
  if (domSelection === null || !domSelection.isCollapsed) return false;
  const points = getDOMSelectionPoints(domSelection, rootElement);
  const anchorNode = points.anchorNode;
  const endOffset = points.anchorOffset;
  if (
    anchorNode === null ||
    anchorNode === undefined ||
    endOffset === null ||
    endOffset === undefined
  ) {
    return false;
  }
  try {
    range.setStart(anchorNode, leadOffset);
    range.setEnd(anchorNode, endOffset);
  } catch {
    return false;
  }
  return true;
}

function isSelectionOnEntityBoundary(editor: LexicalEditor, offset: number): boolean {
  if (offset !== 0) return false;
  return editor.read("latest", () => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return false;
    const previous = selection.anchor.getNode().getPreviousSibling();
    return $isTextNode(previous) && previous.isTextEntity();
  });
}

export interface TypeaheadMenuPluginProps<TOption extends MenuOption> {
  /** Told the query after the trigger as it is typed, and `null` when there is none. */
  onQueryChange: (matchingString: string | null) => void;
  onSelectOption: SelectOptionFn<TOption>;
  options: TOption[];
  triggerFn: TriggerFn;
  menuRenderFn?: MenuRenderFn<TOption>;
  onOpen?: (resolution: MenuResolution) => void;
  onClose?: () => void | PromiseLike<void>;
  anchorClassName?: string;
  /** Names the listbox, in the reader's words. @default "Typeahead menu" */
  menuLabel?: string;
  commandPriority?: CommandListenerPriority;
  /** Where the menu is appended. The body, or the editor's shadow root, by default. */
  parent?: HTMLElement;
  preselectFirstItem?: boolean;
  /** Open even when the caret sits right after a text entity, such as a mention. */
  ignoreEntityBoundary?: boolean;
}

/**
 * A menu under the caret while the text before it matches `triggerFn`: an
 * `@` mention picker, a `/` command list. The query is reported through
 * `onQueryChange`; `options` is what to offer for it, and `onSelectOption`
 * applies the one chosen, handed the text node holding the query so it can
 * replace it.
 */
export function LexicalTypeaheadMenuPlugin<TOption extends MenuOption>(
  props: TypeaheadMenuPluginProps<TOption>,
): JSX.Element {
  const editor = useLexicalEditor();
  const [resolution, setResolution] = mirror<MenuResolution | null>(null);
  // Whether the menu is open as onOpen and onClose see it: a close whose
  // onClose promise is pending is already closed here.
  let isOpen = false;
  let generation = 0;

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    const closing = generation;
    function finish(): void {
      if (generation === closing) setResolution(null);
    }
    let result: void | PromiseLike<void> = undefined;
    try {
      result = props.onClose?.();
    } finally {
      if (result) result.then(finish, finish);
      else finish();
    }
  }

  function open(next: MenuResolution): void {
    generation++;
    setResolution(next);
    if (!isOpen) {
      isOpen = true;
      props.onOpen?.(next);
    }
  }

  function onUpdate(): void {
    editor.read("latest", () => {
      if (!editor.isEditable()) {
        close();
        return;
      }
      function closeUnlessComposing(): void {
        if (!editor.isComposing()) close();
      }
      const editorWindow = editor._window ?? window;
      const range = editorWindow.document.createRange();
      const selection = $getSelection();
      const text = $isRangeSelection(selection) ? getTextUpToAnchor(selection) : null;
      if (!$isRangeSelection(selection) || !selection.isCollapsed() || text === null) {
        closeUnlessComposing();
        return;
      }
      const match: MenuTextMatch | null = props.triggerFn(text, editor);
      props.onQueryChange(match === null ? null : match.matchingString);
      if (
        match !== null &&
        (props.ignoreEntityBoundary === true ||
          !isSelectionOnEntityBoundary(editor, match.leadOffset)) &&
        tryToPositionRange(match.leadOffset, range, editorWindow, editor.getRootElement())
      ) {
        open({ getRect: () => range.getBoundingClientRect(), match });
        return;
      }
      closeUnlessComposing();
    });
  }

  onCleanup(editor.registerUpdateListener(onUpdate));
  onCleanup(
    editor.registerEditableListener((isEditable) => {
      if (!isEditable) close();
    }),
  );

  return (
    <Show when={resolution()}>
      {(current: () => MenuResolution) => (
        <LexicalMenu<TOption>
          editor={editor}
          onClose={close}
          resolution={current()}
          options={props.options}
          onSelectOption={props.onSelectOption}
          onHidden={close}
          menuRenderFn={props.menuRenderFn}
          shouldSplitNodeWithQuery={true}
          commandPriority={props.commandPriority}
          preselectFirstItem={props.preselectFirstItem}
          anchorClassName={props.anchorClassName}
          menuLabel={props.menuLabel}
          parent={props.parent}
        />
      )}
    </Show>
  );
}
