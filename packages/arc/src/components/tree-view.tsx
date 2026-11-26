import {
  type Child,
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key } from "@barqjs/aria/collections";
import { DragButton, type DragAndDropHooks } from "@barqjs/aria/drag-and-drop";
import {
  Tree,
  TreeItem,
  TreeItemContent,
  TreeItemDescription,
  TreeItemExpandButton,
  type TreeItemRenderState,
  TreeLoadMoreItem,
  useTreeItem,
} from "@barqjs/aria/tree";
import { controllable } from "@barqjs/aria/utils";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { GripVertical } from "@barqjs/lucide/icons/grip-vertical";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { Checkbox } from "@barqjs/ui/checkbox";
import { inputVariants } from "@barqjs/ui/input";
import { icon } from "@barqjs/ui/shared-icon";
import { Spinner } from "@barqjs/ui/spinner";
import { tokens } from "@barqjs/ui/theme/tokens";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  control,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  motion,
  rounded,
  space,
  square,
  target,
  truncate,
  type,
} from "../style/index.ts";
import { type ArcMessages, useArcMessages } from "./messages.ts";

export interface TreeNode {
  id: string;
  label: string;
  /** Before the label. Hidden from assistive tech. */
  icon?: Child;
  /** After the label, quieter, and read after its name. */
  description?: string;
  /** At the row's end: a status, a count, unsaved changes. */
  end?: Child;
  /** Its children. Left out with `hasChildren`, they load when it opens. */
  children?: readonly TreeNode[];
  /** Expandable before its children have loaded. */
  hasChildren?: boolean;
  /** More children than are loaded: a row at its end asks for the next ones. */
  hasMore?: boolean;
  isDisabled?: boolean;
}

interface Loader {
  readonly loader: string | null;
}

type Row = TreeNode | Loader;

function isLoader(row: Row): row is Loader {
  return "loader" in row;
}

export const treeViewStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, focus.outline, type.sm, { outlineStyle: "none" }),
    row: arc(
      focus.inset,
      rounded.md,
      motion.colours,
      interaction.hover,
      interaction.selected,
      interaction.disabled,
      interaction.dragging,
      {
        outlineStyle: "none",
        "[data-drop-target]": { boxShadow: `inset 0 0 0 2px ${tokens.ring}` },
      },
    ),
    content: arc(layout.row, layout.minZero, gap[1.5], target.size, {
      paddingInlineStart: "calc(var(--spacing) * 5 * (var(--tree-item-level, 1) - 1))",
      paddingInlineEnd: space.x2,
    }),
    expand: arc(
      control.bare,
      layout.inlineCentre,
      layout.noShrink,
      rounded.sm,
      fg.muted,
      glyph.sm,
      motion.transform,
      square.x6,
      { "[data-expanded] > svg": { rotate: "90deg" } },
    ),
    spacer: arc(layout.noShrink, { width: space.x6 }),
    drag: arc(control.bare, layout.inlineCentre, layout.noShrink, fg.muted, glyph.sm, {
      cursor: "grab",
    }),
    checkbox: arc(layout.noShrink),
    icon: arc(layout.inlineCentre, layout.noShrink, fg.muted, glyph.md),
    label: arc(truncate, layout.minZero),
    description: arc(type.meta, truncate, layout.minZero),
    end: arc(layout.inlineCentre, layout.noShrink, layout.pushEnd),
    rename: arc(layout.column, layout.grow, layout.minZero, gap[1], { paddingBlock: space.x1 }),
    renameInput: arc(inputVariants()),
    renameError: arc(type.meta, fg.danger),
    loader: arc(layout.row, gap[2], type.meta, fg.muted, {
      paddingBlock: space.x1_5,
      paddingInlineStart: "calc(var(--spacing) * 5 * var(--tree-item-level, 1))",
    }),
  },
});

type Slots = ReturnType<typeof treeViewStyles>;

export interface TreeViewProps<T extends TreeNode> extends Customisable<Slots> {
  items: readonly T[];
  /** Names the tree. */
  "aria-label": string;
  /** @default "none" */
  selectionMode?: "none" | "single" | "multiple";
  selectedKeys?: "all" | Iterable<Key>;
  defaultSelectedKeys?: "all" | Iterable<Key>;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  expandedKeys?: Iterable<Key>;
  defaultExpandedKeys?: Iterable<Key>;
  onExpandedChange?: (keys: Set<Key>) => void;
  disabledKeys?: Iterable<Key>;
  /** Enter, or a press on a row with no selection: open it. */
  onAction?: (key: Key) => void;
  /**
   * A row with `hasChildren` and no `children` was opened: load them. The
   * row shows a loading line under it while its id is in `loadingKeys`.
   */
  onLoadChildren?: (id: string) => void;
  /** More is wanted: the root's next items (`null`) or a row's (its id). */
  onLoadMore?: (id: string | null) => void;
  /** Rows, or the root (`""`), whose children are on their way. */
  loadingKeys?: Iterable<string>;
  /** More items at the root than are loaded. */
  hasMore?: boolean;
  /**
   * Drag and drop from `@barqjs/aria`'s `dragAndDrop()`: reorder, move a row
   * into another. Each row gets a drag button for the keyboard.
   */
  dragAndDropHooks?: DragAndDropHooks;
  /** What an empty tree shows. */
  empty?: Child;
  id?: string;
  /**
   * A row's label edited in place: F2 on a row opens a field over it, Enter
   * or leaving it saves, Escape puts the label back. Called with the new
   * label when it changed; returns the row's new id when renaming changes it,
   * so focus goes back to the row.
   */
  onRename?: (id: string, label: string) => string | void;
  /** The row whose label is being edited, `null` for none. */
  renamingKey?: string | null;
  defaultRenamingKey?: string | null;
  onRenamingKeyChange?: (id: string | null) => void;
  /** Why a new label cannot be saved, or `undefined` when it can. The field stays open while it answers. */
  validateLabel?: (label: string, id: string) => string | undefined;
  /** The part of the label selected as the field opens. @default all of it */
  renameSelection?: (label: string) => readonly [number, number];
  /** Names the field. @default "Rename" and the label */
  renameFieldLabel?: (node: T) => string;
}

/**
 * A hierarchy to browse and choose from: folders, a project's pages, an
 * organisation's teams.
 *
 * ```tsx
 * <TreeView
 *   aria-label="Files"
 *   items={folders()}
 *   selectionMode="multiple"
 *   onLoadChildren={(id) => fetchChildren(id)}
 *   loadingKeys={loading()}
 * />
 * ```
 *
 * On `@barqjs/aria`'s tree: one Tab stop, Up and Down between rows, Right to
 * open or go in, Left to close or go out, both in the reading direction,
 * type-ahead, and selection by Space or a press with a checkbox per row when
 * several can be chosen. A row with `hasChildren` and no `children` calls
 * `onLoadChildren` as it opens; `hasMore` puts a row at the end of a level
 * that asks `onLoadMore` for the rest as it comes into view. With
 * `dragAndDropHooks` rows drag to reorder or into another, by pointer, touch
 * or a drag button the keyboard reaches. With `onRename`, F2 opens a field
 * over the focused row's label: Enter or leaving it saves, Escape puts the
 * label back, `validateLabel` keeps it open with a reason, and focus returns
 * to the row. Set `renamingKey` to open it from elsewhere, a menu or a row
 * just added.
 */
export function TreeView<T extends TreeNode>(props: TreeViewProps<T>) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(treeViewStyles(), props.classes);
  }
  function loading(): Set<string> {
    return new Set(props.loadingKeys ?? []);
  }
  function children(node: TreeNode): Row[] | undefined {
    const own: Row[] = [...(node.children ?? [])];
    if (node.hasMore === true || (loading().has(node.id) && node.children === undefined)) {
      own.push({ loader: node.id });
    }
    return own.length === 0 ? undefined : own;
  }
  function roots(): Row[] {
    const own: Row[] = [...props.items];
    if (props.hasMore === true || loading().has("")) own.push({ loader: null });
    return own;
  }
  let expanded = new Set<Key>(props.expandedKeys ?? props.defaultExpandedKeys ?? []);
  const [renaming, setRenaming] = controllable<string | null>(
    () => props.renamingKey,
    () => props.defaultRenamingKey ?? null,
    (next) => props.onRenamingKeyChange?.(next),
  );
  const root = makeRef<HTMLDivElement>();
  function rowElement(id: string): HTMLElement | null {
    return root()?.querySelector<HTMLElement>(`[role="row"][data-key="${CSS.escape(id)}"]`) ?? null;
  }
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "F2" || props.onRename === undefined || untrack(renaming) !== null) return;
    const origin = event.target as Element | null;
    const row = origin?.closest<HTMLElement>('[role="row"][data-key]');
    const id = row?.dataset["key"];
    if (row === null || row === undefined || row !== origin || id === undefined) return;
    if (row.getAttribute("aria-disabled") === "true") return;
    event.preventDefault();
    setRenaming(id);
  }
  let refocusKey: string | null = null;
  if (!isServer) {
    createEffect(renaming, (now) => {
      const key = refocusKey;
      refocusKey = null;
      if (now === null && key !== null) untrack(() => rowElement(key))?.focus();
    });
    createEffect(root, (element) => {
      if (element === null) return undefined;
      element.addEventListener("keydown", onKeyDown, true);
      return () => element.removeEventListener("keydown", onKeyDown, true);
    });
  }
  function finish(id: string, label: string | null, refocus: boolean): void {
    if (untrack(renaming) !== id) return;
    const node = byId(props.items, id);
    let next = id;
    if (label !== null && node !== undefined && label !== node.label) {
      next = props.onRename?.(id, label) ?? id;
    }
    refocusKey = refocus ? next : null;
    setRenaming(null);
  }
  function byId(rows: readonly TreeNode[], id: Key): TreeNode | undefined {
    for (const row of rows) {
      if (row.id === id) return row;
      const found = byId(row.children ?? [], id);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  return (
    <Tree<Row>
      ref={root.set}
      keyboardNavigationBehavior={renaming() === null ? "arrow" : "tab"}
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="tree-view"
      aria-label={props["aria-label"]}
      items={roots()}
      getKey={(row: Row) => (isLoader(row) ? `__loader:${row.loader ?? ""}` : row.id)}
      getTextValue={(row: Row) => (isLoader(row) ? "" : row.label)}
      getChildren={(row: Row) => (isLoader(row) ? undefined : children(row))}
      getType={(row: Row) => (isLoader(row) ? "loader" : "item")}
      selectionMode={props.selectionMode}
      selectedKeys={props.selectedKeys}
      defaultSelectedKeys={props.defaultSelectedKeys}
      onSelectionChange={(keys: "all" | Set<Key>) => props.onSelectionChange?.(keys)}
      expandedKeys={props.expandedKeys}
      defaultExpandedKeys={props.defaultExpandedKeys}
      onExpandedChange={(keys: Set<Key>) => {
        props.onExpandedChange?.(keys);
        const opened = [...keys].filter((key) => !expanded.has(key));
        expanded = new Set(keys);
        for (const key of opened) {
          const node = byId(props.items, key);
          if (
            node?.hasChildren === true &&
            node.children === undefined &&
            !loading().has(node.id)
          ) {
            props.onLoadChildren?.(node.id);
          }
        }
      }}
      disabledKeys={[...(props.disabledKeys ?? []), ...collectDisabled(props.items)]}
      onAction={props.onAction === undefined ? undefined : (key: Key) => props.onAction?.(key)}
      dragAndDropHooks={props.dragAndDropHooks}
      renderEmptyState={() => props.empty}
    >
      {(row: Row) =>
        isLoader(row) ? (
          <TreeLoadMoreItem
            class={cls().loader}
            data-slot="tree-view-loader"
            isLoading={loading().has(row.loader ?? "")}
            onLoadMore={() => props.onLoadMore?.(row.loader)}
          >
            <Spinner />
            {messages().loadingMore}
          </TreeLoadMoreItem>
        ) : (
          <TreeItem
            class={cls().row}
            data-slot="tree-view-row"
            hasChildItems={row.hasChildren === true || (row.children?.length ?? 0) > 0}
          >
            <TreeItemContent>
              {(state: TreeItemRenderState) => (
                <Content
                  node={row}
                  state={state}
                  classes={cls()}
                  dragging={props.dragAndDropHooks !== undefined}
                  renaming={renaming() === row.id}
                  fieldLabel={
                    props.renameFieldLabel?.(row as T) ?? messages().renameItem(row.label)
                  }
                  validate={(label) => props.validateLabel?.(label, row.id)}
                  selection={props.renameSelection}
                  messages={messages()}
                  onFinish={(label, refocus) => finish(row.id, label, refocus)}
                />
              )}
            </TreeItemContent>
          </TreeItem>
        )
      }
    </Tree>
  );
}

function collectDisabled(rows: readonly TreeNode[]): string[] {
  return rows.flatMap((row) => [
    ...(row.isDisabled === true ? [row.id] : []),
    ...collectDisabled(row.children ?? []),
  ]);
}

interface ContentProps {
  node: TreeNode;
  state: TreeItemRenderState;
  classes: Slots;
  dragging: boolean;
  renaming: boolean;
  fieldLabel: string;
  validate: (label: string) => string | undefined;
  selection: ((label: string) => readonly [number, number]) | undefined;
  messages: ArcMessages;
  /** `null` puts the label back; `refocus` sends focus back to the row. */
  onFinish: (label: string | null, refocus: boolean) => void;
}

interface RenameFieldProps {
  label: string;
  fieldLabel: string;
  validate: (label: string) => string | undefined;
  selection: ((label: string) => readonly [number, number]) | undefined;
  classes: Slots;
  onFinish: (label: string | null, refocus: boolean) => void;
}

/**
 * The row presses, drags and takes focus back from a control in it focused
 * without the keyboard; none of that may reach it from the field.
 */
function keepInField(event: Event): void {
  event.stopPropagation();
}

function RenameField(props: RenameFieldProps) {
  const input = makeRef<HTMLInputElement>();
  const [error, setError] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const errorId = createUniqueId();
  let done = false;
  createEffect(input, (element) => {
    if (element === null) return;
    element.focus();
    const [start, end] = props.selection?.(element.value) ?? [0, element.value.length];
    element.setSelectionRange(start, end);
  });
  function commit(refocus: boolean): void {
    if (done) return;
    const value = input()?.value.trim() ?? "";
    if (value === "") {
      done = true;
      props.onFinish(null, refocus);
      return;
    }
    const problem = props.validate(value);
    if (problem !== undefined) {
      if (!refocus) {
        done = true;
        props.onFinish(null, false);
        return;
      }
      setError(problem);
      return;
    }
    done = true;
    props.onFinish(value, refocus);
  }
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      done = true;
      props.onFinish(null, true);
    }
  }
  return (
    <span class={props.classes.rename} data-slot="tree-view-rename">
      <input
        ref={input.set}
        class={props.classes.renameInput}
        data-slot="tree-view-rename-input"
        data-size="sm"
        value={props.label}
        aria-label={props.fieldLabel}
        aria-invalid={error() === undefined ? undefined : "true"}
        aria-describedby={error() === undefined ? undefined : errorId}
        autocomplete="off"
        spellcheck={false}
        onKeyDown={onKeyDown}
        onInput={() => setError(undefined)}
        onBlur={() => commit(false)}
        onFocusIn={keepInField}
        onPointerDown={keepInField}
        onMouseDown={keepInField}
        onClick={keepInField}
        onDblClick={keepInField}
      />
      <Show when={error() !== undefined}>
        <span
          id={errorId}
          class={props.classes.renameError}
          data-slot="tree-view-rename-error"
          role="alert"
        >
          {error()}
        </span>
      </Show>
    </span>
  );
}

function Content(props: ContentProps) {
  const row = useTreeItem();
  const box = row.item.checkboxProps;
  return (
    <div class={props.classes.content} data-slot="tree-view-content">
      <Show when={props.dragging}>
        <DragButton class={props.classes.drag} data-slot="tree-view-drag">
          <GripVertical aria-hidden="true" />
        </DragButton>
      </Show>
      <Show
        when={props.state.hasChildItems()}
        fallback={<span class={props.classes.spacer} data-slot="tree-view-spacer" />}
      >
        <TreeItemExpandButton class={props.classes.expand} data-slot="tree-view-expand">
          <ChevronRight class={icon.directional} aria-hidden="true" />
        </TreeItemExpandButton>
      </Show>
      <Show when={props.state.selectionMode() === "multiple"}>
        <Checkbox
          class={props.classes.checkbox}
          data-slot="tree-view-checkbox"
          id={box.id()}
          aria-label={box["aria-label"]()}
          aria-labelledby={box["aria-labelledby"]()}
          isSelected={box.isSelected()}
          isDisabled={box.isDisabled()}
          onChange={() => box.onChange()}
        />
      </Show>
      <Show when={props.node.icon !== undefined}>
        <span class={props.classes.icon} data-slot="tree-view-icon" aria-hidden="true">
          {props.node.icon}
        </span>
      </Show>
      <Show
        when={props.renaming}
        fallback={
          <span class={props.classes.label} data-slot="tree-view-label">
            {props.node.label}
          </span>
        }
      >
        <RenameField
          label={props.node.label}
          fieldLabel={props.fieldLabel}
          validate={props.validate}
          selection={props.selection}
          classes={props.classes}
          onFinish={props.onFinish}
        />
      </Show>
      <Show when={props.node.description !== undefined && !props.renaming}>
        <TreeItemDescription class={props.classes.description} data-slot="tree-view-description">
          {props.node.description}
        </TreeItemDescription>
      </Show>
      <Show when={props.node.end !== undefined && !props.renaming}>
        <span class={props.classes.end} data-slot="tree-view-end">
          {props.node.end}
        </span>
      </Show>
    </div>
  );
}
