import {
  type Accessor,
  For,
  createEffect,
  createMemo,
  createRenderEffect,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { type JSX, Portal } from "@barqjs/web";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { getScrollParent } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  type CommandListenerPriority,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalEditor,
  type TextNode,
  getDOMShadowRoots,
  isDOMShadowRoot,
  mergeRegister,
  registerEventListener,
} from "lexical";

import { mirror } from "./hooks.ts";
import { type MenuOption, SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND } from "./menu-option.ts";

/**
 * Where a trigger matched the text before the caret: the offset the match
 * starts at, the query after the trigger, and the whole matched text, trigger
 * included, which a chosen option replaces.
 */
export interface MenuTextMatch {
  leadOffset: number;
  matchingString: string;
  replaceableString: string;
}

/** An open menu: the box it is placed against, and the match that opened it. */
export interface MenuResolution {
  match?: MenuTextMatch;
  getRect: () => DOMRect;
}

/** Decides from the text before the caret whether a typeahead menu opens. */
export type TriggerFn = (text: string, editor: LexicalEditor) => MenuTextMatch | null;

export type SelectOptionFn<TOption extends MenuOption> = (
  option: TOption,
  textNodeContainingQuery: TextNode | null,
  closeMenu: () => void,
  matchingString: string,
) => void;

/** What a custom menu is drawn from. Everything that changes is an accessor. */
export interface MenuRenderProps<TOption extends MenuOption> {
  options: Accessor<TOption[]>;
  selectedIndex: Accessor<number | null>;
  selectOptionAndCleanUp: (option: TOption) => void;
  setHighlightedIndex: (index: number) => void;
  matchingString: Accessor<string>;
  /**
   * The `id` an option element must carry: the editor points
   * `aria-activedescendant` at the highlighted one by it.
   */
  optionId: (index: number) => string;
}

/**
 * Draws a menu's contents. It is placed inside the menu's listbox, which is
 * positioned under the caret or the node, so it needs no portal of its own.
 */
export type MenuRenderFn<TOption extends MenuOption> = (
  menu: MenuRenderProps<TOption>,
) => JSX.Element;

export interface MenuProps<TOption extends MenuOption> {
  editor: LexicalEditor;
  /** Closes the menu: Escape, or a choice that calls the `closeMenu` it is handed. */
  onClose: () => void;
  resolution: MenuResolution;
  options: TOption[];
  onSelectOption: SelectOptionFn<TOption>;
  /** Closes the menu when its anchor scrolls out of the editor's scroll container. */
  onHidden: () => void;
  menuRenderFn?: MenuRenderFn<TOption>;
  shouldSplitNodeWithQuery?: boolean;
  commandPriority?: CommandListenerPriority;
  preselectFirstItem?: boolean;
  anchorClassName?: string;
  /** Names the listbox. @default "Typeahead menu" */
  menuLabel?: string;
  parent?: HTMLElement;
}

let menus = 0;

function getFullMatchOffset(documentText: string, entryText: string, from: number): number {
  let triggerOffset = from;
  for (let i = triggerOffset; i <= entryText.length; i++) {
    if (documentText.slice(-i) === entryText.substring(0, i)) triggerOffset = i;
  }
  return triggerOffset;
}

/** Split off the text node that holds the query, so an option can replace it. */
function $splitNodeContainingQuery(match: MenuTextMatch): TextNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const anchor = selection.anchor;
  if (anchor.type !== "text") return null;
  const anchorNode = anchor.getNode();
  if (!anchorNode.isSimpleText()) return null;
  const selectionOffset = anchor.offset;
  const textContent = anchorNode.getTextContent().slice(0, selectionOffset);
  const queryOffset = getFullMatchOffset(
    textContent,
    match.matchingString,
    match.replaceableString.length,
  );
  const startOffset = selectionOffset - queryOffset;
  if (startOffset < 0) return null;
  if (startOffset === 0) return anchorNode.splitText(selectionOffset)[0] ?? null;
  return anchorNode.splitText(startOffset, selectionOffset)[1] ?? null;
}

function scrollIntoViewIfNeeded(target: HTMLElement): void {
  const menu = target.closest<HTMLElement>("[data-lexical-menu]");
  if (menu !== null) {
    const rect = menu.getBoundingClientRect();
    const view = menu.ownerDocument.defaultView;
    if (view !== null && (rect.top + rect.height > view.innerHeight || rect.top < 0)) {
      menu.scrollIntoView({ block: "center" });
    }
  }
  target.scrollIntoView({ block: "nearest" });
}

function isVisibleIn(rect: DOMRect, container: HTMLElement): boolean {
  const bounds = container.getBoundingClientRect();
  const margin = 6;
  return rect.top >= bounds.top - margin && rect.top <= bounds.bottom + margin;
}

/** Where the menu is appended: the editor's shadow root when it has one, else the body. */
function menuParent(editor: LexicalEditor, parent: HTMLElement | undefined): Node | null {
  if (parent !== undefined) return parent;
  const root = editor.getRootElement();
  if (root === null) return typeof document === "undefined" ? null : document.body;
  const host = root.getRootNode();
  return isDOMShadowRoot(host) ? host : root.ownerDocument.body;
}

/**
 * The menu's listbox, placed against `resolution` and kept there through
 * scrolling and resizing, with the keyboard handling Lexical's React menu
 * has: arrows move the highlight, Enter and Tab choose, Escape closes. Focus
 * stays in the editor, which points `aria-activedescendant` at the highlighted
 * option and `aria-controls` at the listbox.
 */
export function LexicalMenu<TOption extends MenuOption>(props: MenuProps<TOption>): JSX.Element {
  const editor = props.editor;
  const close = props.onClose;
  function resolution(): MenuResolution {
    return props.resolution;
  }
  function options(): TOption[] {
    return props.options;
  }
  const onSelectOption = props.onSelectOption;
  const onHidden = props.onHidden;
  const render = props.menuRenderFn;
  const split = props.shouldSplitNodeWithQuery ?? false;
  const priority = props.commandPriority ?? COMMAND_PRIORITY_LOW;
  const preselect = props.preselectFirstItem ?? true;
  const className = props.anchorClassName;
  const mount = menuParent(editor, props.parent);

  const listboxId = `typeahead-menu-${++menus}`;
  function optionId(index: number): string {
    return `${listboxId}-item-${index}`;
  }

  const [rawSelected, setHighlightedIndex] = mirror<number | null>(null);
  const selectedIndex = createMemo((): number | null => {
    const raw = rawSelected();
    return raw === null ? null : Math.min(options().length - 1, raw);
  });
  const matchingString = createMemo(() => resolution().match?.matchingString ?? "");

  createEffect(matchingString, () => {
    if (preselect) setHighlightedIndex(0);
  });

  function selectOptionAndCleanUp(option: TOption): void {
    const current = untrack(resolution);
    editor.update(() => {
      const node =
        current.match !== undefined && split ? $splitNodeContainingQuery(current.match) : null;
      onSelectOption(option, node, close, current.match?.matchingString ?? "");
    });
  }

  // With the default menu and nothing to show, nothing is on screen, and the
  // keys have to reach the editor. A custom menu may draw a "no results" panel
  // that still takes them.
  function rendersNothing(): boolean {
    return render === undefined && options().length === 0;
  }

  function move(event: KeyboardEvent, step: 1 | -1): boolean {
    if (rendersNothing()) return false;
    const list = options();
    const current = selectedIndex();
    const next =
      current === null
        ? step === 1
          ? 0
          : list.length - 1
        : (current + step + list.length) % Math.max(list.length, 1);
    setHighlightedIndex(next);
    const option = list[next];
    if (option === undefined) setHighlightedIndex(-1);
    else if (option.ref.current !== null) {
      editor.dispatchCommand(SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND, { index: next, option });
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  function choose(event: KeyboardEvent | null): boolean {
    const index = selectedIndex();
    const option = index === null ? undefined : options()[index];
    if (option === undefined) return false;
    if (event !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    selectOptionAndCleanUp(option);
    return true;
  }

  onCleanup(
    mergeRegister(
      editor.registerCommand(
        SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND,
        ({ option }) => {
          if (option.ref.current === null) return false;
          scrollIntoViewIfNeeded(option.ref.current);
          return true;
        },
        priority,
      ),
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, (event) => move(event, 1), priority),
      editor.registerCommand(KEY_ARROW_UP_COMMAND, (event) => move(event, -1), priority),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (rendersNothing()) return false;
          event.preventDefault();
          event.stopImmediatePropagation();
          close();
          return true;
        },
        priority,
      ),
      editor.registerCommand(KEY_TAB_COMMAND, (event) => choose(event), priority),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => (event !== null && event.shiftKey ? false : choose(event)),
        priority,
      ),
    ),
  );

  // The editor is the combobox: it names the listbox and the highlighted option.
  createRenderEffect(selectedIndex, (index) => {
    const root = editor.getRootElement();
    if (root === null) return;
    root.setAttribute("aria-controls", listboxId);
    if (index === null || index < 0) root.removeAttribute("aria-activedescendant");
    else root.setAttribute("aria-activedescendant", optionId(index));
  });
  onCleanup(() => {
    const root = editor.getRootElement();
    root?.removeAttribute("aria-controls");
    root?.removeAttribute("aria-activedescendant");
  });

  const [placed, setPlaced] = mirror<HTMLElement | null>(null);

  createEffect(
    () => [placed(), resolution()] as const,
    ([element, current]) => {
      if (element === null) return undefined;
      const reference = {
        getBoundingClientRect: () => current.getRect(),
        contextElement: editor.getRootElement() ?? undefined,
      };
      const place: () => void = () => {
        void computePosition(reference, element, {
          strategy: "absolute",
          placement: "bottom-start",
          middleware: [offset(3), flip({ padding: 8 }), shift({ padding: 8 })],
        }).then(({ x, y }) => {
          element.style.left = `${x}px`;
          element.style.top = `${y}px`;
        });
      };
      const root = editor.getRootElement();
      const scroller = root === null ? element.ownerDocument.body : getScrollParent(root, false);
      let wasVisible = isVisibleIn(current.getRect(), scroller);
      function onScroll(): void {
        const visible = isVisibleIn(current.getRect(), scroller);
        if (visible === wasVisible) return;
        wasVisible = visible;
        if (!visible) onHidden();
      }
      // Scroll events do not leave a shadow tree, so each one the editor is
      // inside is listened to as well as the document.
      const shadows = root === null ? [] : getDOMShadowRoots(root);
      return mergeRegister(
        autoUpdate(reference, element, place),
        registerEventListener(element.ownerDocument, "scroll", onScroll, {
          capture: true,
          passive: true,
        }),
        ...shadows.map((shadow) =>
          registerEventListener(shadow, "scroll", onScroll, { capture: true, passive: true }),
        ),
      );
    },
  );

  function bind(element: HTMLDivElement): void {
    return setPlaced(element);
  }

  const menu: MenuRenderProps<TOption> = {
    options,
    selectedIndex,
    selectOptionAndCleanUp,
    setHighlightedIndex,
    matchingString,
    optionId,
  };

  return (
    <Portal mount={mount}>
      <div
        ref={bind}
        id={listboxId}
        class={className}
        role="listbox"
        aria-label={props.menuLabel ?? "Typeahead menu"}
        data-lexical-menu=""
        style={{ display: "block", position: "absolute", top: "0px", left: "0px" }}
      >
        {render === undefined ? <DefaultMenu menu={menu} /> : render(menu)}
      </div>
    </Portal>
  );
}

interface DefaultMenuProps<TOption extends MenuOption> {
  menu: MenuRenderProps<TOption>;
}

function DefaultMenu<TOption extends MenuOption>(props: DefaultMenuProps<TOption>): JSX.Element {
  const menu = props.menu;
  return (
    <div class="typeahead-popover mentions-menu">
      <ul>
        <For each={menu.options()}>
          {(option: TOption, index: Accessor<number>) => (
            <li
              tabIndex={-1}
              class={menu.selectedIndex() === index() ? "item selected" : "item"}
              ref={(element: HTMLLIElement) => option.setRefElement(element)}
              role="option"
              aria-selected={menu.selectedIndex() === index()}
              id={menu.optionId(index())}
              onMouseEnter={() => menu.setHighlightedIndex(index())}
              onClick={() => {
                menu.setHighlightedIndex(index());
                menu.selectOptionAndCleanUp(option);
              }}
            >
              {typeof option.icon === "function" ? option.icon() : option.icon}
              <span class="text">{option.title}</span>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
