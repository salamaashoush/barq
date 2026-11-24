import { Show, createEffect, untrack } from "@barqjs/core";
import type { JSX } from "@barqjs/web";
import { $getNodeByKey, type CommandListenerPriority, type NodeKey } from "lexical";

import { useLexicalEditor } from "./context.ts";
import { mirror } from "./hooks.ts";
import {
  LexicalMenu,
  type MenuRenderFn,
  type MenuResolution,
  type SelectOptionFn,
} from "./menu.tsx";
import type { MenuOption } from "./menu-option.ts";

export interface NodeMenuPluginProps<TOption extends MenuOption> {
  onSelectOption: SelectOptionFn<TOption>;
  options: TOption[];
  /** The node the menu is anchored to; `null` closes it. */
  nodeKey: NodeKey | null;
  menuRenderFn?: MenuRenderFn<TOption>;
  onClose?: () => void;
  onOpen?: (resolution: MenuResolution) => void;
  anchorClassName?: string;
  /** Names the listbox, in the reader's words. @default "Typeahead menu" */
  menuLabel?: string;
  commandPriority?: CommandListenerPriority;
  parent?: HTMLElement;
}

/**
 * A menu anchored to a node rather than the caret, such as the actions on a
 * node just inserted. It is open while `nodeKey` names a node that is on
 * screen, and follows the node as it changes.
 */
export function LexicalNodeMenuPlugin<TOption extends MenuOption>(
  props: NodeMenuPluginProps<TOption>,
): JSX.Element {
  const editor = useLexicalEditor();
  const [resolution, setResolution] = mirror<MenuResolution | null>(null);

  function closeNodeMenu(): void {
    const wasOpen = untrack(resolution) !== null;
    setResolution(null);
    if (wasOpen) props.onClose?.();
  }

  function positionOrCloseMenu(key: NodeKey | null): void {
    if (key === null) {
      if (untrack(resolution) !== null) closeNodeMenu();
      return;
    }
    const element = editor.read("latest", () =>
      $getNodeByKey(key) === null ? null : editor.getElementByKey(key),
    );
    if (element === null || untrack(resolution) !== null) return;
    const next: MenuResolution = { getRect: () => element.getBoundingClientRect() };
    setResolution(next);
    props.onOpen?.(next);
  }

  createEffect(
    () => props.nodeKey,
    (key) => {
      positionOrCloseMenu(key);
      if (key === null) return undefined;
      return editor.registerUpdateListener(({ dirtyElements }) => {
        if (dirtyElements.get(key)) positionOrCloseMenu(key);
      });
    },
  );

  return (
    <Show when={resolution()}>
      {(current: () => MenuResolution) => (
        <LexicalMenu<TOption>
          editor={editor}
          onClose={closeNodeMenu}
          resolution={current()}
          options={props.options}
          onSelectOption={props.onSelectOption}
          onHidden={closeNodeMenu}
          menuRenderFn={props.menuRenderFn}
          commandPriority={props.commandPriority}
          anchorClassName={props.anchorClassName}
          menuLabel={props.menuLabel}
          parent={props.parent}
        />
      )}
    </Show>
  );
}
