import { describe, expect, test } from "bun:test";
import { createSignal, flush, For, onCleanup } from "@barqjs/core";
import { ref as makeRef, mergeRefs } from "@barqjs/primitives/refs";
import { accessibleName, render, screen, tick, user } from "@barqjs/testing";
import {
  Autocomplete,
  type AutocompleteComponentProps,
  type AutocompleteFilter,
  useAutocompleteCollection,
  useAutocompleteInput,
} from "./autocomplete.tsx";
import { type Key, listState, type Node } from "./collections.ts";
import {
  listBox,
  type ListBoxContextValue,
  ListBoxProvider,
  Option,
  optionIdFor,
  provideItemNode,
} from "./listbox.tsx";
import { menu, menuItem, menuItemIdFor } from "./menu.tsx";
import { searchField } from "./textfield.tsx";
import { mergeProps } from "./utils.ts";

interface Fruit {
  id: string;
  name: string;
  isDisabled?: boolean;
}

const FRUITS: Fruit[] = [
  { id: "apple", name: "Apple" },
  { id: "apricot", name: "Apricot" },
  { id: "banana", name: "Banana" },
  { id: "cherry", name: "Cherry" },
];

const contains: AutocompleteFilter = (textValue, inputValue) =>
  textValue.toLowerCase().includes(inputValue.toLowerCase());

/** A search field, wired the way `<SearchField>` would be inside an autocomplete. */
function Search() {
  const auto = useAutocompleteInput();
  const domRef = makeRef<HTMLInputElement>();
  const { inputProps, labelProps } = searchField({ label: "Fruit", ...auto?.inputOptions }, domRef);
  return (
    <>
      <label {...labelProps}>Fruit</label>
      <input
        {...mergeProps(inputProps, auto?.inputProps ?? {})}
        ref={mergeRefs(domRef.set, auto?.ref)}
      />
    </>
  );
}

/** A listbox, wired the way `<ListBox>` would be inside an autocomplete. */
function Fruits(props: {
  items?: Fruit[];
  selectionMode?: "none" | "single";
  onAction?: (key: Key) => void;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
}) {
  const auto = useAutocompleteCollection();
  const domRef = makeRef<HTMLUListElement>();
  const state = listState<Fruit>({
    items: () => props.items ?? FRUITS,
    getTextValue: (fruit: Fruit) => fruit.name,
    selectionMode: () => props.selectionMode ?? "single",
    filter: auto?.filterNodes as
      | ((nodes: Iterable<Node<Fruit>>) => Iterable<Node<Fruit>>)
      | undefined,
    onSelectionChange: (keys) => props.onSelectionChange?.(keys),
  });
  const { listBoxProps, baseId } = listBox({ ref: domRef, ...auto?.collectionProps }, state);
  if (auto !== null) {
    onCleanup(auto.connect({ ref: domRef, state, idFor: (key) => optionIdFor(baseId(), key) }));
  }
  const value: ListBoxContextValue = {
    state,
    baseId,
    shouldSelectOnPressUp: () => undefined,
    shouldUseVirtualFocus: () => auto?.collectionProps.shouldUseVirtualFocus(),
  };
  return (
    <ListBoxProvider value={value}>
      <ul {...listBoxProps} ref={domRef.set}>
        <For each={() => [...state.collection()]}>
          {(node: Node<Fruit>) => {
            provideItemNode(node);
            const act = props.onAction;
            return (
              <Option onAction={act === undefined ? undefined : () => act(node.key)}>
                {node.textValue}
              </Option>
            );
          }}
        </For>
      </ul>
    </ListBoxProvider>
  );
}

function Example(
  props: Omit<AutocompleteComponentProps, "children"> & {
    onAction?: (key: Key) => void;
    selectionMode?: "none" | "single";
    onSelectionChange?: (keys: "all" | Set<Key>) => void;
  },
) {
  return (
    <Autocomplete {...props}>
      <Search />
      <Fruits
        onAction={props.onAction}
        selectionMode={props.selectionMode}
        onSelectionChange={props.onSelectionChange}
      />
    </Autocomplete>
  );
}

function field(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("searchbox");
}

function options(): HTMLElement[] {
  return screen.queryAllByRole("option");
}

function names(): string[] {
  return options().map((option) => option.textContent ?? "");
}

function highlighted(): string | null {
  const id = field().getAttribute("aria-activedescendant");
  return id === null ? null : (document.getElementById(id)?.textContent ?? null);
}

function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 20));
}

/** Backspace as an editor delivers it: announced as a deletion first. */
function backspace(input: HTMLInputElement): void {
  input.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteContentBackward",
    }),
  );
  input.value = input.value.slice(0, -1);
  input.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }),
  );
  flush();
}

describe("Autocomplete", () => {
  test("the field controls the list, which is named for what it is", () => {
    render(() => <Example filter={contains} />);

    const listbox = screen.getByRole("listbox");
    expect(field().getAttribute("aria-controls")).toBe(listbox.id);
    expect(field().getAttribute("aria-autocomplete")).toBe("list");
    expect(field().getAttribute("autocomplete")).toBe("off");
    expect(field().getAttribute("autocorrect")).toBe("off");
    expect(field().getAttribute("spellcheck")).toBe("false");
    expect(field().getAttribute("enterkeyhint")).toBe("go");
    expect(accessibleName(listbox)).toBe("Suggestions");
    expect(field().hasAttribute("aria-activedescendant")).toBe(false);
  });

  test("the list is not a Tab stop: focus stays in the field", () => {
    render(() => <Example filter={contains} />);
    expect(screen.getByRole("listbox").hasAttribute("tabindex")).toBe(false);
    for (const option of options()) expect(option.hasAttribute("tabindex")).toBe(false);
  });

  test("typing filters the list", () => {
    const seen: string[] = [];
    render(() => <Example filter={contains} onInputChange={(value) => seen.push(value)} />);

    user.type(field(), "ap");
    flush();

    expect(names()).toEqual(["Apple", "Apricot"]);
    expect(seen).toEqual(["a", "ap"]);
  });

  test("without a filter the list is shown whole", () => {
    render(() => <Example />);
    user.type(field(), "zz");
    flush();
    expect(names()).toHaveLength(4);
  });

  test("typing forward highlights the first match, named on the field a moment later", async () => {
    render(() => <Example filter={contains} />);

    user.type(field(), "b");
    flush();
    expect(options()[0]?.hasAttribute("data-focused")).toBe(true);
    expect(highlighted()).toBeNull();

    await after(500);
    flush();
    expect(highlighted()).toBe("Banana");
    expect(document.activeElement).toBe(field());
  });

  test("disableAutoFocusFirst leaves the highlight alone", async () => {
    render(() => <Example filter={contains} disableAutoFocusFirst />);

    user.type(field(), "b");
    await after(500);
    flush();

    expect(highlighted()).toBeNull();
  });

  test("the arrows move the highlight, and focus never leaves the field", () => {
    render(() => <Example filter={contains} />);
    user.focus(field());

    user.keyDown("ArrowDown");
    flush();
    expect(highlighted()).toBe("Apple");

    user.keyDown("ArrowDown");
    flush();
    expect(highlighted()).toBe("Apricot");

    user.keyDown("ArrowUp");
    flush();
    expect(highlighted()).toBe("Apple");

    user.keyDown("End");
    flush();
    expect(highlighted()).toBe("Cherry");
    expect(document.activeElement).toBe(field());
  });

  test("the arrows do not move the caret", () => {
    render(() => <Example filter={contains} />);
    user.focus(field());
    expect(user.keyDown("ArrowDown")).toBe(false);
  });

  test("Enter acts on the highlighted item", () => {
    const acted: Key[] = [];
    render(() => (
      <Example filter={contains} selectionMode="none" onAction={(key) => acted.push(key)} />
    ));
    user.focus(field());

    user.keyDown("ArrowDown");
    user.keyDown("ArrowDown");
    flush();
    user.key("Enter");
    flush();

    expect(acted).toEqual(["apricot"]);
    expect(document.activeElement).toBe(field());
  });

  test("Enter selects the highlighted option where the list selects", () => {
    const chosen: string[] = [];
    render(() => (
      <Example
        filter={contains}
        onSelectionChange={(keys) => chosen.push([...(keys as Set<Key>)].join())}
      />
    ));
    user.focus(field());

    user.keyDown("ArrowDown");
    flush();
    user.key("Enter");
    flush();

    expect(chosen).toEqual(["apple"]);
  });

  test("Space types a space rather than choosing", () => {
    render(() => <Example filter={contains} selectionMode="single" />);
    user.focus(field());
    user.keyDown("ArrowDown");
    flush();

    user.type(field(), " ");
    flush();

    expect(field().value).toBe(" ");
    expect(options().some((option) => option.getAttribute("aria-selected") === "true")).toBe(false);
  });

  test("left and right with nothing highlighted move the caret and are not passed on", () => {
    render(() => <Example filter={contains} />);
    user.focus(field());

    expect(user.keyDown("ArrowLeft")).toBe(true);
    flush();
    expect(highlighted()).toBeNull();
  });

  test("left and right silence the highlight; down continues from it", () => {
    render(() => <Example filter={contains} />);
    user.focus(field());
    user.keyDown("ArrowDown");
    user.keyDown("ArrowDown");
    flush();
    expect(highlighted()).toBe("Apricot");

    user.keyDown("ArrowLeft");
    flush();
    expect(highlighted()).toBeNull();

    user.keyDown("ArrowDown");
    flush();
    expect(highlighted()).toBe("Banana");
  });

  test("deleting clears the highlight", async () => {
    render(() => <Example filter={contains} />);
    user.type(field(), "ap");
    await after(500);
    flush();
    expect(highlighted()).toBe("Apple");

    backspace(field());
    flush();

    expect(highlighted()).toBeNull();
    expect(names()).toEqual(["Apple", "Apricot", "Banana"]);
  });

  test("leaving the field takes the ring off the highlight, and coming back restores it", () => {
    render(() => (
      <>
        <Example filter={contains} />
        <button type="button">After</button>
      </>
    ));
    user.focus(field());
    user.keyDown("ArrowDown");
    flush();
    expect(options()[0]?.hasAttribute("data-focused")).toBe(true);

    user.focus(screen.getByRole("button", { name: "After" }));
    flush();
    expect(options()[0]?.hasAttribute("data-focused")).toBe(false);

    user.focus(field());
    flush();
    expect(options()[0]?.hasAttribute("data-focused")).toBe(true);
    expect(highlighted()).toBe("Apple");
  });

  test("a press on the field clears the highlight", () => {
    render(() => <Example filter={contains} />);
    user.focus(field());
    user.keyDown("ArrowDown");
    flush();

    user.pointerDown(field());
    flush();

    expect(highlighted()).toBeNull();
  });

  test("a click on an option keeps focus in the field", () => {
    const acted: Key[] = [];
    render(() => (
      <Example filter={contains} selectionMode="none" onAction={(key) => acted.push(key)} />
    ));
    user.focus(field());

    user.click(options()[2] as HTMLElement);
    flush();

    expect(acted).toEqual(["banana"]);
    expect(document.activeElement).toBe(field());
  });

  test("controlled, the field shows the query it is given", () => {
    const [query, setQuery] = createSignal("ch");
    const seen: string[] = [];
    render(() => (
      <Example filter={contains} inputValue={query()} onInputChange={(value) => seen.push(value)} />
    ));
    expect(field().value).toBe("ch");
    expect(names()).toEqual(["Cherry"]);

    user.type(field(), "x");
    flush();
    expect(seen).toEqual(["chx"]);
    expect(field().value).toBe("ch");

    setQuery("ban");
    flush();
    expect(names()).toEqual(["Banana"]);
  });

  test("Escape the list does not use goes on to what is around it", () => {
    const escapes: string[] = [];
    render(() => (
      <div
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === "Escape") escapes.push(event.key);
        }}
      >
        <Example filter={contains} selectionMode="none" />
      </div>
    ));
    user.type(field(), "a");
    flush();
    // The search field uses the first Escape to clear itself.
    user.keyDown("Escape");
    flush();
    expect(field().value).toBe("");
    expect(escapes).toEqual([]);

    user.keyDown("Escape");
    flush();
    expect(escapes).toEqual(["Escape"]);
  });

  test("disableVirtualFocus: no highlight on the field and no keys passed on", () => {
    render(() => <Example filter={contains} disableVirtualFocus />);
    user.focus(field());

    user.keyDown("ArrowDown");
    flush();

    expect(field().hasAttribute("aria-activedescendant")).toBe(false);
    expect(screen.getByRole("listbox").getAttribute("tabindex")).toBe("0");
  });

  test("a disabled option is skipped by the first highlight", async () => {
    function Disabled() {
      return (
        <Autocomplete filter={contains}>
          <Search />
          <Fruits
            items={[
              { id: "apple", name: "Apple", isDisabled: true },
              { id: "apricot", name: "Apricot" },
            ]}
          />
        </Autocomplete>
      );
    }
    render(() => <Disabled />);

    user.type(field(), "a");
    await after(500);
    flush();

    expect(highlighted()).toBe("Apricot");
  });

  test("a menu works the same way, with the menu's own ids", async () => {
    const acted: Key[] = [];
    function Commands() {
      const auto = useAutocompleteCollection();
      const domRef = makeRef<HTMLUListElement>();
      const state = listState<Fruit>({
        items: () => FRUITS,
        getTextValue: (fruit: Fruit) => fruit.name,
        filter: auto?.filterNodes as
          | ((nodes: Iterable<Node<Fruit>>) => Iterable<Node<Fruit>>)
          | undefined,
      });
      const { menuProps, baseId } = menu({ ref: domRef, ...auto?.collectionProps }, state);
      if (auto !== null) {
        onCleanup(
          auto.connect({ ref: domRef, state, idFor: (key) => menuItemIdFor(baseId(), key) }),
        );
      }
      function Item(props: { node: Node<Fruit> }) {
        const itemRef = makeRef<HTMLLIElement>();
        const { menuItemProps } = menuItem(
          {
            key: props.node.key,
            ref: itemRef,
            baseId,
            shouldUseVirtualFocus: () => auto?.collectionProps.shouldUseVirtualFocus(),
            onAction: (key) => acted.push(key),
          },
          state,
        );
        return (
          <li {...menuItemProps} ref={itemRef.set}>
            {props.node.textValue}
          </li>
        );
      }
      return (
        <ul {...menuProps} ref={domRef.set}>
          <For each={() => [...state.collection()]}>
            {(node: Node<Fruit>) => <Item node={node} />}
          </For>
        </ul>
      );
    }
    render(() => (
      <Autocomplete filter={contains}>
        <Search />
        <Commands />
      </Autocomplete>
    ));

    user.type(field(), "ch");
    await after(500);
    await tick();
    flush();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Cherry"]);
    expect(highlighted()).toBe("Cherry");

    user.key("Enter");
    flush();
    expect(acted).toEqual(["cherry"]);
  });
});
