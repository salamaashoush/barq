/**
 * A collection made of the items that RENDER, for a widget written as JSX
 * children rather than as `items` plus a render function.
 *
 * ```tsx
 * <Menu>
 *   <MenuItem>Rename</MenuItem>
 *   <MenuItem isDisabled>Duplicate</MenuItem>
 * </Menu>
 * ```
 *
 * Every collection widget here is driven by a `ListState`, which wants data.
 * This turns rendered items INTO that data, so the keyboard delegate, the
 * typeahead and the selection manager are the same ones the data-driven form
 * uses and nothing about them is written twice.
 *
 * The decisions:
 *
 * - **An item registers when its component is created and leaves when its
 *   scope is disposed.** A row behind a `<Show>` is in the collection exactly
 *   while it is in the document, so an arrow key never lands on a hidden one.
 * - **The order is the document's.** Registration order is creation order,
 *   which is document order for a first render and wrong for a row a `<Show>`
 *   inserts later, so the entries are sorted by position once their elements
 *   exist.
 * - **The text is the element's own unless the item says otherwise.** That is
 *   what a typeahead matches against, and it is read after the row has been
 *   built: an item's label is usually its children.
 * - **A key is generated unless the item gives one.** A menu item has nothing
 *   to be identified by; an option's `value` is its key.
 */

import {
  type Accessor,
  createContext,
  createMemo,
  createSignal,
  createUniqueId,
  getContext,
  onCleanup,
  onSettled,
  provide,
} from "@barqjs/core";

import type { ItemAccessors, Key } from "./collections.ts";
import { access, type MaybeAccessor } from "./utils.ts";

/** One rendered item, as the data a `ListState` is built from. */
export interface StaticEntry {
  key: Key;
  type: "item" | "section";
  textValue: string;
  /** `isDisabled`, `href`, and whatever the widget adds. */
  props: Record<string, unknown>;
  children?: StaticEntry[];
}

export interface StaticItemOptions {
  /** @default a generated id */
  key?: Key | undefined;
  /** @default "item" */
  type?: "item" | "section";
  /** @default the element's text */
  textValue?: MaybeAccessor<string | undefined>;
  /** Per-item options, read whenever the collection is rebuilt. */
  props?: () => Record<string, unknown>;
  /** Leave the item out without unmounting it: a row a filter has hidden. */
  isHidden?: MaybeAccessor<boolean | undefined>;
}

export interface StaticItem {
  key: Key;
  /** Goes on the item's element, which is where its text and position are read. */
  ref: (element: Element | null) => void;
  /** The element, once it exists. */
  element: Accessor<Element | null>;
}

export interface StaticCollection {
  /** The registered items in document order, sections holding their children. */
  entries: Accessor<StaticEntry[]>;
  /** Every registered key in document order, hidden ones included. */
  keys: Accessor<Key[]>;
  /** The element a key rendered, if it is still registered. */
  elementOf: (key: Key) => Element | null;
  register: (options: StaticItemOptions, parentKey: Key | undefined) => StaticItem;
}

interface Registration {
  key: Key;
  type: "item" | "section";
  parentKey: Key | undefined;
  options: StaticItemOptions;
  element: Accessor<Element | null>;
  order: number;
}

/** How a `ListState` reads a {@link StaticEntry}. */
export const staticAccessors: ItemAccessors<StaticEntry> = {
  getKey: (entry) => entry.key,
  getTextValue: (entry) => entry.textValue,
  getChildren: (entry) => entry.children,
  getType: (entry) => entry.type,
  getProps: (entry) => entry.props,
};

function byDocument(a: Registration, b: Registration): number {
  const first = a.element();
  const second = b.element();
  if (first === null || second === null) return a.order - b.order;
  const relation = first.compareDocumentPosition(second);
  if ((relation & Node.DOCUMENT_POSITION_DISCONNECTED) !== 0) return a.order - b.order;
  if ((relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) return -1;
  if ((relation & Node.DOCUMENT_POSITION_PRECEDING) !== 0) return 1;
  return a.order - b.order;
}

export function staticCollection(): StaticCollection {
  const registered = new Map<Key, Registration>();
  let created = 0;
  // The map is the state; the signal only says it changed. Items register from
  // component bodies, which is an owned scope, hence `ownedWrite`.
  const [version, setVersion] = createSignal(0, { ownedWrite: true });
  const changed = (): void => {
    setVersion((current) => current + 1);
  };

  const ordered = createMemo((): Registration[] => {
    version();
    return [...registered.values()].toSorted(byDocument);
  });

  const entryOf = (registration: Registration, all: Registration[]): StaticEntry => {
    const entry: StaticEntry = {
      key: registration.key,
      type: registration.type,
      textValue:
        access(registration.options.textValue) ?? registration.element()?.textContent?.trim() ?? "",
      props: registration.options.props?.() ?? {},
    };
    if (registration.type === "section") {
      entry.children = all
        .filter((child) => child.parentKey === registration.key && isShown(child))
        .map((child) => entryOf(child, all));
    }
    return entry;
  };

  const isShown = (registration: Registration): boolean =>
    access(registration.options.isHidden) !== true;

  const entries = createMemo((): StaticEntry[] => {
    const all = ordered();
    return all
      .filter((registration) => registration.parentKey === undefined && isShown(registration))
      .map((registration) => entryOf(registration, all));
  });

  return {
    entries,
    keys: () => ordered().map((registration) => registration.key),
    elementOf: (key) => registered.get(key)?.element() ?? null,
    register: (options, parentKey) => {
      const key = options.key ?? createUniqueId();
      const [element, setElement] = createSignal<Element | null>(null, { ownedWrite: true });
      const registration: Registration = {
        key,
        type: options.type ?? "item",
        parentKey,
        options,
        element,
        order: created++,
      };
      registered.set(key, registration);
      changed();

      // By the time the tree has settled the row is attached and its children
      // are built, so the position and the text are both the real ones.
      onSettled(changed);
      onCleanup(() => {
        // Only its own entry: the same key rendered a second time has replaced
        // this one, and that copy is still there.
        if (registered.get(key) === registration) registered.delete(key);
        changed();
      });

      return { key, ref: (node) => setElement(node), element };
    },
  };
}

const StaticSectionContext = createContext<Key | null>(null);

/**
 * Register one rendered item with `collection`, under the section it is
 * rendered inside, if any.
 */
export function staticItem(collection: StaticCollection, options: StaticItemOptions): StaticItem {
  return collection.register(options, getContext(StaticSectionContext) ?? undefined);
}

/**
 * Build `children` as the contents of the section `key`.
 *
 * A call rather than something installed on the ambient owner: a component has
 * no scope of its own, so an install would put every later sibling of the
 * section inside it too.
 */
export function provideStaticSection(key: Key, children: () => unknown): unknown {
  return provide(StaticSectionContext, () => key, children);
}
