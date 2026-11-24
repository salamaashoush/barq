/**
 * The collection machinery on its own, with no widget around it.
 *
 * Every list, menu and grid in the package is `listState` plus
 * `selectableList` plus a `selectableItem` per row, so a harness of exactly
 * those three is where a behaviour they all share is pinned.
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  DEV,
  For,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  flush,
  isDev,
} from "@barqjs/core";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { render, screen, user } from "@barqjs/testing";
import {
  buildCollection,
  type Collection,
  getItemCount,
  type Key,
  listState,
  type ListState,
  multipleSelectionState,
  type Node,
  SelectionManager,
  type SelectionMode,
} from "./collections.ts";
import { scrollIntoView } from "./dom.ts";
import { itemElement, selectableItem, selectableList, type LinkBehavior } from "./selection.ts";

interface Fruit {
  id: string;
  name: string;
  href?: string;
  children?: Fruit[];
}

function Item(props: {
  node: Node<unknown>;
  state: ListState<unknown>;
  linkBehavior?: LinkBehavior;
  withField?: boolean;
}) {
  const ref = makeRef<HTMLDivElement>();
  const { itemProps } = selectableItem({
    key: props.node.key,
    ref,
    selectionManager: props.state.selectionManager,
    linkBehavior: props.linkBehavior,
  });
  return (
    <div {...itemProps} role="option" ref={ref.set}>
      {props.node.textValue}
      {props.withField === true ? <input aria-label={`Note on ${props.node.textValue}`} /> : null}
    </div>
  );
}

function List(props: {
  items: Fruit[];
  selectionMode?: SelectionMode;
  linkBehavior?: LinkBehavior;
  withFields?: boolean;
}) {
  const ref = makeRef<HTMLDivElement>();
  const state = listState<Fruit>({
    items: () => props.items,
    selectionMode: () => props.selectionMode ?? "none",
  }) as unknown as ListState<unknown>;
  const { listProps } = selectableList({
    ref,
    selectionManager: state.selectionManager,
    collection: state.collection,
    disabledKeys: state.disabledKeys,
    linkBehavior: props.linkBehavior,
  });
  return (
    <div {...listProps} role="listbox" aria-label="Fruit" ref={ref.set}>
      <For each={() => [...state.collection()]}>
        {(node: Node<unknown>) => (
          <Item
            node={node}
            state={state}
            linkBehavior={props.linkBehavior}
            withField={props.withFields}
          />
        )}
      </For>
    </div>
  );
}

const FRUIT: Fruit[] = [
  { id: "apple", name: "Apple" },
  { id: "banana", name: "Banana" },
  { id: "blueberry", name: "Blueberry" },
  { id: "cherry", name: "Cherry" },
];

function focused(): string | null | undefined {
  return document.activeElement?.textContent;
}

describe("typeahead", () => {
  test("the same letter again steps to the next item starting with it", () => {
    render(() => <List items={FRUIT} />);
    user.focus(screen.getByRole("option", { name: "Apple" }));
    flush();

    user.key("b");
    flush();
    expect(focused()).toBe("Banana");

    user.key("b");
    flush();
    expect(focused(), "a repeated letter was read as the search 'bb'").toBe("Blueberry");

    user.key("b");
    flush();
    expect(focused(), "the cycle wraps back to the first match").toBe("Banana");
  });

  test("a longer prefix still lands on the item a shorter one reached", () => {
    render(() => <List items={FRUIT} />);
    user.focus(screen.getByRole("option", { name: "Apple" }));
    flush();

    user.key("b");
    user.key("l");
    flush();
    expect(focused()).toBe("Blueberry");
  });

  test("typing the focused item's own letter moves past it, as a native select does", () => {
    render(() => <List items={FRUIT} />);
    user.focus(screen.getByRole("option", { name: "Banana" }));
    flush();

    user.key("b");
    flush();
    expect(focused()).toBe("Blueberry");
  });
});

describe("finding an item's element", () => {
  test("an item inside the collection is found by its key", () => {
    render(() => <List items={FRUIT} />);
    const list = screen.getByRole("listbox");
    expect(itemElement(list, "cherry")).toBe(screen.getByRole("option", { name: "Cherry" }));
  });

  test("Page Down in a list that does not scroll goes to the last item", () => {
    render(() => <List items={FRUIT} />);
    user.focus(screen.getByRole("option", { name: "Apple" }));
    flush();

    user.keyDown("PageDown");
    flush();
    expect(focused(), "the layout could not find the focused item's element").toBe("Cherry");
  });

  test("an item of a collection nested inside another does not answer for the outer one", () => {
    render(() => (
      <div data-collection="outer" data-testid="outer">
        <div data-collection="inner">
          <div data-key="apple">inner apple</div>
        </div>
        <div data-key="apple">outer apple</div>
      </div>
    ));
    expect(itemElement(screen.getByTestId("outer"), "apple")?.textContent).toBe("outer apple");
  });
});

describe("link items", () => {
  const LINKS: Fruit[] = [
    { id: "docs", name: "Docs", href: "/docs" },
    { id: "blog", name: "Blog", href: "/blog" },
  ];

  let stop = (): void => {};
  afterEach(() => stop());

  function watchAnchors(): { href: string | null; prevented: boolean }[] {
    const seen: { href: string | null; prevented: boolean }[] = [];
    const listener = (event: Event): void => {
      const target = event.target;
      if (target instanceof HTMLAnchorElement) {
        seen.push({ href: target.getAttribute("href"), prevented: event.defaultPrevented });
      }
    };
    // Bubble phase on the document, so every handler on the way up has had
    // its say about the default.
    document.addEventListener("click", listener);
    stop = () => document.removeEventListener("click", listener);
    return seen;
  }

  test("an item with an href says where it goes", () => {
    render(() => <List items={LINKS} />);
    expect(screen.getByRole("option", { name: "Docs" }).getAttribute("data-href")).toBe("/docs");
  });

  test("pressing a link item follows it", () => {
    const seen = watchAnchors();
    render(() => <List items={LINKS} />);

    user.click(screen.getByRole("option", { name: "Blog" }));
    flush();

    expect(seen, "the item cancelled the click the router dispatched").toEqual([
      { href: "/blog", prevented: false },
    ]);
  });

  test("an item that leaves links alone carries no href", () => {
    render(() => <List items={LINKS} linkBehavior="none" />);
    expect(screen.getByRole("option", { name: "Docs" }).hasAttribute("data-href")).toBe(false);
  });
});

describe("getItemCount", () => {
  test("counts items, not the sections that hold them", () => {
    const collection = buildCollection<Fruit>([
      { id: "a", name: "A", children: [FRUIT[0] as Fruit, FRUIT[1] as Fruit] },
      { id: "b", name: "B", children: [FRUIT[2] as Fruit, FRUIT[3] as Fruit] },
    ]);
    expect(collection.size).toBe(6);
    expect(getItemCount(collection)).toBe(4);
  });
});

describe("duplicate keys", () => {
  test("are reported while developing, and only then", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      buildCollection<Fruit>([
        { id: "apple", name: "Apple" },
        { id: "apple", name: "Another apple" },
      ]);
      const reported = warn.mock.calls.some((call) => String(call[0]).includes('"apple"'));
      expect(reported).toBe(isDev);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("focus inside an item", () => {
  test("a field inside the item keeps the focus it was given", () => {
    render(() => <List items={FRUIT} withFields />);
    const field = screen.getByRole("textbox", { name: "Note on Apple" });

    user.click(field);
    flush();

    expect(document.activeElement === field, "the item took focus back from its field").toBe(true);
  });
});

describe("which collection an item belongs to", () => {
  test("every item names its collection as the collection does", () => {
    render(() => <List items={FRUIT} />);
    const list = screen.getByRole("listbox");
    const id = list.getAttribute("data-collection");

    expect(id).not.toBeNull();
    for (const option of screen.getAllByRole("option")) {
      expect(option.getAttribute("data-collection")).toBe(id);
    }
  });
});

describe("document order across levels", () => {
  /** A tree whose indexes count siblings, as a tree's collection numbers them. */
  class Tree implements Collection<unknown> {
    #nodes = new Map<Key, Node<unknown>>();
    #roots: Node<unknown>[];

    constructor(roots: Node<unknown>[]) {
      this.#roots = roots;
      const visit = (entry: Node<unknown>): void => {
        this.#nodes.set(entry.key, entry);
        for (const child of entry.childNodes) visit(child);
      };
      for (const root of roots) visit(root);
    }

    get size(): number {
      return this.#nodes.size;
    }
    *[Symbol.iterator](): IterableIterator<Node<unknown>> {
      yield* this.#roots;
    }
    getKeys(): Iterable<Key> {
      return this.#roots.map((root) => root.key);
    }
    getItem(key: Key): Node<unknown> | null {
      return this.#nodes.get(key) ?? null;
    }
    getKeyBefore(): Key | null {
      return null;
    }
    getKeyAfter(): Key | null {
      return null;
    }
    getFirstKey(): Key | null {
      return this.#roots[0]?.key ?? null;
    }
    getLastKey(): Key | null {
      return this.#roots.at(-1)?.key ?? null;
    }
    getChildren(key: Key): Iterable<Node<unknown>> {
      return this.#nodes.get(key)?.childNodes ?? [];
    }
    at(): Node<unknown> | null {
      return null;
    }
  }

  function node(key: string, index: number, parentKey?: string, childNodes: Node<unknown>[] = []) {
    return {
      type: "item" as const,
      key,
      value: null,
      textValue: key,
      level: parentKey === undefined ? 0 : 1,
      index,
      parentKey,
      hasChildNodes: childNodes.length > 0,
      childNodes,
      props: {},
    };
  }

  test("a row's child comes before its parent's next sibling", () => {
    // documents (0) > [taxes (0), letters (1) > [june (0)]], music (1)
    const june = node("june", 0, "letters");
    const letters = node("letters", 1, "documents", [june]);
    const documents = node("documents", 0, undefined, [node("taxes", 0, "documents"), letters]);
    const music = node("music", 1);
    const tree = new Tree([documents, music]);

    const manager = new SelectionManager(
      tree,
      multipleSelectionState({
        selectionMode: "multiple",
        defaultSelectedKeys: ["music", "june"],
      }),
    );

    expect(manager.firstSelectedKey, "a grandchild tied with its great-uncle").toBe("june");
    expect(manager.lastSelectedKey).toBe("music");
  });
});

describe("bringing an item into view on iPadOS", () => {
  /** A right-to-left scroller 100px wide with a 15px scrollbar, holding an item at its left edge. */
  function scrolled(): number {
    const view = document.createElement("div");
    const item = document.createElement("div");
    view.style.direction = "rtl";
    view.append(item);
    document.body.append(view);
    const box = (left: number, right: number): DOMRect =>
      ({ top: 0, bottom: 20, left, right, width: right - left, height: 20 }) as DOMRect;
    view.getBoundingClientRect = () => box(0, 100);
    item.getBoundingClientRect = () => box(0, 20);
    Object.defineProperty(view, "offsetWidth", { value: 100, configurable: true });
    Object.defineProperty(view, "clientWidth", { value: 85, configurable: true });
    let left = 0;
    view.scrollTo = ((to: ScrollToOptions) => {
      left = to.left ?? 0;
    }) as typeof view.scrollTo;
    scrollIntoView(view, item);
    view.remove();
    return left;
  }

  function pretend(navigatorProps: Record<string, unknown>, run: () => void): void {
    const saved = Object.keys(navigatorProps).map(
      (name) => [name, Object.getOwnPropertyDescriptor(navigator, name)] as const,
    );
    for (const [name, value] of Object.entries(navigatorProps)) {
      Object.defineProperty(navigator, name, { value, configurable: true });
    }
    try {
      run();
    } finally {
      for (const [name, descriptor] of saved) {
        if (descriptor === undefined) Reflect.deleteProperty(navigator, name);
        else Object.defineProperty(navigator, name, descriptor);
      }
    }
  }

  test("the scrollbar is on the right, as on every iOS device", () => {
    pretend(
      {
        platform: "MacIntel",
        maxTouchPoints: 5,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      },
      () => {
        expect(scrolled(), "an iPad was taken for a desktop and scrolled past the scrollbar").toBe(
          0,
        );
      },
    );
  });

  test("on a desktop the right-to-left scrollbar is on the left", () => {
    pretend(
      {
        platform: "Win32",
        maxTouchPoints: 0,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      },
      () => {
        expect(scrolled()).toBe(-15);
      },
    );
  });
});

describe("one manager for a list's life", () => {
  test("a read of the focus or the mode is not run again when the items change", () => {
    const [items, setItems] = createSignal<Fruit[]>(FRUIT);
    let runs = 0;
    const { state, focusedKey, dispose } = createRoot((disposeRoot) => {
      const list = listState<Fruit>({ items, selectionMode: () => "single" });
      const read = createMemo(() => {
        runs++;
        const manager = list.selectionManager();
        return `${manager.selectionMode}:${String(manager.focusedKey)}`;
      });
      return { state: list, focusedKey: read, dispose: disposeRoot };
    });
    expect(focusedKey()).toBe("single:null");
    const before = state.selectionManager();

    setItems([...FRUIT, { id: "date", name: "Date" }]);
    flush();
    expect(focusedKey()).toBe("single:null");
    expect(runs, "every option of a list re-ran its reads when an item joined").toBe(1);
    expect(state.selectionManager()).toBe(before);
    expect(state.selectionManager().collection.getItem("date")?.textValue).toBe("Date");

    state.selectionManager().setFocusedKey("date");
    flush();
    expect(focusedKey()).toBe("single:date");
    dispose();
  });

  test("a write from an effect's callback checks the key without reading the list untracked", () => {
    const [target, setTarget] = createSignal<string | null>(null);
    const capture = DEV.diagnostics.capture();
    const { state, dispose } = createRoot((disposeRoot) => {
      const list = listState<Fruit>({ items: FRUIT, selectionMode: () => "single" });
      createEffect(target, (key) => {
        if (key === null) return;
        list.selectionManager().setFocusedKey(key);
        list.selectionManager().replaceSelection(key);
      });
      return { state: list, dispose: disposeRoot };
    });
    flush();
    setTarget("cherry");
    flush();
    expect(state.selectionManager().focusedKey).toBe("cherry");
    expect(state.selectionManager().isSelected("cherry")).toBe(true);
    const strict = capture.stop().filter((event) => event.code === "STRICT_READ_UNTRACKED");
    expect(strict).toEqual([]);
    dispose();
  });
});
