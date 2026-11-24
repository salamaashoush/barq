/**
 * A navigation tree: a site's or an app's sections as a tree of links.
 *
 * It is a {@link Tree} with the choices a navigation makes already made. There
 * is no selection, because the page is what is "selected", and that is
 * `selectedRoute`, matched against each item's `href`. The row hands focus to
 * its link, so Enter follows it and a screen reader announces a link; the arrow
 * keys still move between rows and expand and collapse them from the link,
 * and Tab leaves the tree from any row.
 *
 * ```tsx
 * <NavigationTree aria-label="Docs" items={pages()} selectedRoute={location.pathname}>
 *   {(page) => (
 *     <NavigationTreeItem>
 *       <NavigationTreeItemContent>
 *         <NavigationTreeLink>{page.title}</NavigationTreeLink>
 *       </NavigationTreeItemContent>
 *     </NavigationTreeItem>
 *   )}
 * </NavigationTree>
 * ```
 *
 * The current item's link carries `aria-current="page"` and its row
 * `data-current`; every row above it, open or not, carries
 * `data-current-ancestor`. Keyboard focus starts on the current item, or on
 * the closest of its ancestors that is showing.
 */

import {
  cells,
  type Accessor,
  type Child,
  createContext,
  createEffect,
  getContext,
  omit,
  provide,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import type { Key } from "./collections.ts";
import { contains, scrollIntoView, scrollParents } from "./dom.ts";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import { link } from "./link.tsx";
import {
  Tree,
  type TreeCollection,
  type TreeComponentProps,
  TreeHeader,
  type TreeHeaderProps,
  TreeItem,
  type TreeItemComponentProps,
  TreeItemContent,
  type TreeItemRenderState,
  TreeSection,
  type TreeSectionProps,
  useTree,
  useTreeItem,
  useTreeNode,
} from "./tree.tsx";
import { filterDOMProps, fromProps, mergeProps, type StyleProps, styleProps } from "./utils.ts";

interface SyncedRoute {
  route: string | null | undefined;
}

interface NavigationTreeContextValue {
  selectedRoute: Accessor<string | null | undefined>;
  /** The route focus was last moved to, so the rows move it once per change between them. */
  synced: SyncedRoute;
  element: Accessor<HTMLDivElement | null>;
}

const NavigationTreeContext = createContext<NavigationTreeContextValue | null>(null);

function useNavigationTree(): NavigationTreeContextValue {
  const value = getContext(NavigationTreeContext);
  if (value === null || value === undefined) {
    throw new Error("A NavigationTreeItem must be rendered inside a NavigationTree.");
  }
  return value;
}

export interface NavigationTreeProps<T> extends Omit<
  TreeComponentProps<T>,
  | "selectionMode"
  | "selectionBehavior"
  | "selectedKeys"
  | "defaultSelectedKeys"
  | "onSelectionChange"
  | "disallowEmptySelection"
  | "disabledBehavior"
  | "keyboardNavigationBehavior"
  | "escapeKeyBehavior"
  | "shouldSelectOnPressUp"
  | "renderEmptyState"
  | "onAction"
> {
  /** The route that is showing, matched against each item's `href`. */
  selectedRoute?: string | null;
}

export function NavigationTree<T>(props: NavigationTreeProps<T>) {
  const treeRef = makeRef<HTMLDivElement>();
  const value: NavigationTreeContextValue = {
    selectedRoute: () => props.selectedRoute,
    synced: { route: undefined },
    element: treeRef,
  };

  return provide(
    NavigationTreeContext,
    () => value,
    () => (
      <Tree
        {...omit(props, "selectedRoute", "ref")}
        ref={mergeRefs(treeRef.set, props.ref)}
        selectionMode="none"
        keyboardNavigationBehavior="tab"
      />
    ),
  );
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** The key of the item whose `href` is the route, hidden or not. */
function keyForRoute(collection: TreeCollection<unknown>, route: string): Key | null {
  for (const key of collection.getKeys()) {
    if (collection.getItem(key)?.props?.href === route) return key;
  }
  return null;
}

interface CachedAncestors {
  route: string;
  ancestors: Set<Key>;
}

const ancestorsCache = new WeakMap<TreeCollection<unknown>, CachedAncestors>();

/** Every row above the route's item, cached so each row does not walk the tree. */
function ancestorsOfRoute(collection: TreeCollection<unknown>, route: string): Set<Key> {
  const cached = ancestorsCache.get(collection);
  if (cached?.route === route) return cached.ancestors;

  const ancestors = new Set<Key>();
  const match = keyForRoute(collection, route);
  let node = match === null ? null : collection.getItem(match);
  while (node?.parentKey !== undefined && !ancestors.has(node.parentKey)) {
    ancestors.add(node.parentKey);
    node = collection.getItem(node.parentKey);
  }
  ancestorsCache.set(collection, { route, ancestors });
  return ancestors;
}

interface NavigationTreeItemContextValue {
  href: Accessor<string | undefined>;
  isCurrent: Accessor<boolean>;
  isCurrentAncestor: Accessor<boolean>;
}

const NavigationTreeItemContext = createContext<NavigationTreeItemContextValue | null>(null);

function useNavigationTreeItem(): NavigationTreeItemContextValue {
  const value = getContext(NavigationTreeItemContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a NavigationTreeItem.");
  }
  return value;
}

export interface NavigationTreeItemProps extends Omit<
  TreeItemComponentProps,
  "onAction" | "allowsArrowNavigation" | "focusMode"
> {}

/**
 * One row. Its `href` is its item's, read from the data like a tree row's.
 *
 * The current row is scrolled to the middle of the tree when the tree is its
 * own scrolling container, and never scrolls the page around it.
 */
export function NavigationTreeItem(props: NavigationTreeItemProps) {
  const navigation = useNavigationTree();
  const root = useTree();
  const node = useTreeNode();
  const rowRef = makeRef<HTMLDivElement>();

  function href(): string | undefined {
    const given = node.props?.href;
    return typeof given === "string" && given.length > 0 ? given : undefined;
  }
  function isCurrent(): boolean {
    return href() !== undefined && href() === navigation.selectedRoute();
  }
  function isCurrentAncestor(): boolean {
    const route = navigation.selectedRoute();
    if (route === null || route === undefined) return false;
    return ancestorsOfRoute(root.state.collection(), route).has(node.key);
  }

  createEffect(
    () => ({
      route: navigation.selectedRoute(),
      collection: root.state.collection(),
    }),
    ({ route, collection }) => {
      if (route === null || route === undefined || navigation.synced.route === route) return;
      const key = keyForRoute(collection, route);
      if (key === null) return;
      navigation.synced.route = route;
      untrack(() => root.state.selectionManager().setFocusedKey(collection.closestShowingKey(key)));
    },
  );

  if (!isServer) {
    createEffect(
      () => (isCurrent() ? rowRef() : null),
      (element) => {
        if (element === null) return;
        const scroller = scrollParents(element.parentElement ?? element, true)[0];
        const tree = untrack(navigation.element);
        if (scroller instanceof HTMLElement && tree !== null && contains(tree, scroller)) {
          scrollIntoView(scroller, element, { block: "center" });
        }
      },
    );
  }

  const item: NavigationTreeItemContextValue = { href, isCurrent, isCurrentAncestor };

  return provide(
    NavigationTreeItemContext,
    () => item,
    () => (
      <TreeItem
        {...omit(props, "children", "ref")}
        ref={mergeRefs(rowRef.set, props.ref)}
        focusMode={href() === undefined ? "row" : "child"}
        allowsArrowNavigation
        data-current={isCurrent() || undefined}
        data-current-ancestor={isCurrentAncestor() || undefined}
      >
        {props.children}
      </TreeItem>
    ),
  );
}

/** A row's state, with where it stands relative to the current route. */
export interface NavigationTreeItemRenderState extends TreeItemRenderState {
  isCurrent: Accessor<boolean>;
  isCurrentAncestor: Accessor<boolean>;
}

export interface NavigationTreeItemContentProps {
  children?: Child | ((row: NavigationTreeItemRenderState) => Child);
}

/** The content of a row, with the row's state and its relation to the route. */
export function NavigationTreeItemContent(props: NavigationTreeItemContentProps) {
  const row = useTreeItem();
  const item = useNavigationTreeItem();
  const state: NavigationTreeItemRenderState = {
    ...row.render,
    isCurrent: item.isCurrent,
    isCurrentAncestor: item.isCurrentAncestor,
  };
  const children = props.children;
  return (
    <TreeItemContent>
      {typeof children === "function" && children.length > 0
        ? (children as (state: NavigationTreeItemRenderState) => Child)(state)
        : children}
    </TreeItemContent>
  );
}

export interface NavigationTreeLinkProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLElement>;
}

/**
 * The row's link, to its item's `href`, with `aria-current="page"` on the
 * current one.
 *
 * On an item with no `href` it is still a link to a screen reader, and
 * pressing it opens and closes the row: a heading that groups pages.
 */
export function NavigationTreeLink(props: NavigationTreeLinkProps) {
  const domRef = makeRef<HTMLElement>();
  const row = useTreeItem();
  const item = useNavigationTreeItem();
  const options = fromProps(cells(props));
  const asAnchor = item.href() !== undefined;

  const { linkProps, isPressed } = link(
    {
      ...options,
      elementType: asAnchor ? "a" : "span",
      href: item.href,
      "aria-current": () => (item.isCurrent() ? "page" : undefined),
      onPress: () => {
        if (item.href() === undefined && row.render.hasChildItems()) {
          row.render.state.toggleKey(row.render.id);
        }
      },
    },
    domRef,
  );
  const { hoverProps, isHovered } = hover({});
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    linkProps,
    hoverProps,
    focusProps,
    filterDOMProps(options, { global: true }),
    styleProps(cells(props)),
    {
      "data-current": item.isCurrent,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
    },
  );

  const ref = mergeRefs(domRef.set, props.ref);
  return asAnchor ? (
    <a {...elementProps} ref={ref}>
      {props.children}
    </a>
  ) : (
    <span {...elementProps} ref={ref}>
      {props.children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export interface NavigationTreeSectionProps extends TreeSectionProps {}

/** A group of top-level rows; see {@link TreeSection}. */
export function NavigationTreeSection(props: NavigationTreeSectionProps) {
  return <TreeSection {...props} />;
}

export interface NavigationTreeHeaderProps extends TreeHeaderProps {}

/** The header of a {@link NavigationTreeSection}. */
export function NavigationTreeHeader(props: NavigationTreeHeaderProps) {
  return <TreeHeader {...props} />;
}
