import { type Child, Show } from "@barqjs/core";
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
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { GripVertical } from "@barqjs/lucide/icons/grip-vertical";
import { Checkbox } from "@barqjs/ui/checkbox";
import { icon } from "@barqjs/ui/shared-icon";
import { Spinner } from "@barqjs/ui/spinner";
import { tokens } from "@barqjs/ui/theme/tokens";

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
import { useArcMessages } from "./messages.ts";

export interface TreeNode {
  id: string;
  label: string;
  /** Before the label. Hidden from assistive tech. */
  icon?: Child;
  /** After the label, quieter, and read after its name. */
  description?: string;
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
 * or a drag button the keyboard reaches.
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
      <span class={props.classes.label} data-slot="tree-view-label">
        {props.node.label}
      </span>
      <Show when={props.node.description !== undefined}>
        <TreeItemDescription class={props.classes.description} data-slot="tree-view-description">
          {props.node.description}
        </TreeItemDescription>
      </Show>
    </div>
  );
}
