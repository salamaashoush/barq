import { afterEach, describe, expect, mock, test } from "bun:test";
import { flush, type Child, Show, createSignal, provide } from "@barqjs/core";
import { ref as makeRef, mergeRefs } from "@barqjs/primitives/refs";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  user,
  within,
} from "@barqjs/testing";
import { Autocomplete, useAutocompleteInput } from "./autocomplete.tsx";
import type { Key } from "./collections.ts";
import { dragAndDrop, type DragAndDropOptions, DropIndicator } from "./drag-and-drop.tsx";
import { dragSession, type DroppableCollectionReorderEvent } from "./dnd/index.ts";
import { RouterContext } from "./interactions/open-link.ts";
import {
  ListBox,
  ListBoxLoadMoreItem,
  type ListBoxRenderState,
  Option,
  Section,
  useSectionHeading,
} from "./listbox.tsx";
import { clearAnnouncer } from "./live.ts";
import { SelectionIndicator } from "./selection-indicator.tsx";
import {
  announcements,
  fireDrag,
  MockDataTransfer,
  nextFrame,
  restoreRects,
  stubRects,
} from "./test-dnd.ts";

// A stub left behind by a failing test would shadow other files' stubs.
afterEach(restoreRects);
import { stubIntersections } from "./test-load-more.ts";
import { searchField } from "./textfield.tsx";
import type { KeyboardDelegate } from "./selection.ts";
import { mergeProps } from "./utils.ts";
import { listLayout, Virtualizer } from "./virtualizer.tsx";

interface Fruit {
  id: string;
  name: string;
  isDisabled?: boolean;
}

const FRUITS: Fruit[] = [
  { id: "apple", name: "Apple" },
  { id: "banana", name: "Banana" },
  { id: "cherry", name: "Cherry", isDisabled: true },
  { id: "date", name: "Date" },
];

// Every prop is a Cell inside a component, so a value is read with `?.()`.
function Fruits(props: {
  selectionMode?: "none" | "single" | "multiple";
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  disallowEmptySelection?: boolean;
  shouldFocusWrap?: boolean;
}) {
  return (
    <ListBox
      label="Fruit"
      items={FRUITS}
      selectionMode={props.selectionMode ?? "single"}
      disallowEmptySelection={props.disallowEmptySelection}
      shouldFocusWrap={props.shouldFocusWrap}
      onSelectionChange={props.onSelectionChange}
      getTextValue={(fruit: Fruit) => fruit.name}
    >
      {(fruit: Fruit) => <Option>{fruit.name}</Option>}
    </ListBox>
  );
}

function keysOf(selection: "all" | Set<Key>): string[] {
  return selection === "all" ? ["all"] : [...selection].map(String).toSorted();
}

describe("ListBox", () => {
  test("is a listbox of options with a name", () => {
    render(() => <Fruits />);

    const list = screen.getByRole("listbox");
    expect(accessibleName(list)).toBe("Fruit");
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  test("multiple selection says so", () => {
    render(() => <Fruits selectionMode="multiple" />);
    expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBe("true");
  });

  test("single selection does not claim to be multiple", () => {
    render(() => <Fruits />);
    expect(screen.getByRole("listbox").hasAttribute("aria-multiselectable")).toBe(false);
  });

  test("every option reports whether it is selected", () => {
    render(() => <Fruits />);
    for (const option of screen.getAllByRole("option")) {
      expect(option.getAttribute("aria-selected")).toBe("false");
    }
  });

  test("a click selects", () => {
    const selections: string[][] = [];
    render(() => <Fruits onSelectionChange={(keys) => selections.push(keysOf(keys))} />);

    user.click(screen.getByRole("option", { name: "Banana" }));

    expect(selections).toEqual([["banana"]]);
    expect(screen.getByRole("option", { name: "Banana" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  test("a second click on the selected option clears it", () => {
    const selections: string[][] = [];
    render(() => <Fruits onSelectionChange={(keys) => selections.push(keysOf(keys))} />);
    const banana = screen.getByRole("option", { name: "Banana" });

    user.click(banana);
    user.click(banana);

    expect(selections).toEqual([["banana"], []]);
  });

  test("disallowEmptySelection keeps the selection", () => {
    const selections: string[][] = [];
    render(() => (
      <Fruits disallowEmptySelection onSelectionChange={(keys) => selections.push(keysOf(keys))} />
    ));
    const banana = screen.getByRole("option", { name: "Banana" });

    user.click(banana);
    user.click(banana);

    expect(selections).toEqual([["banana"]]);
  });

  test("multiple selection adds rather than replaces", () => {
    const selections: string[][] = [];
    render(() => (
      <Fruits
        selectionMode="multiple"
        onSelectionChange={(keys) => selections.push(keysOf(keys))}
      />
    ));

    user.click(screen.getByRole("option", { name: "Apple" }));
    user.click(screen.getByRole("option", { name: "Banana" }));

    expect(selections).toEqual([["apple"], ["apple", "banana"]]);
  });

  test("a disabled option cannot be selected", () => {
    const selections: string[][] = [];
    render(() => <Fruits onSelectionChange={(keys) => selections.push(keysOf(keys))} />);

    const cherry = screen.getByRole("option", { name: "Cherry" });
    expect(cherry.getAttribute("aria-disabled")).toBe("true");

    user.click(cherry);
    expect(selections).toEqual([]);
  });

  test("the listbox is ONE Tab stop", () => {
    render(() => <Fruits />);

    const list = screen.getByRole("listbox");
    // Nothing focused inside yet, so the listbox itself is the stop.
    expect(list.getAttribute("tabindex")).toBe("0");
    for (const option of screen.getAllByRole("option")) {
      expect(option.getAttribute("tabindex")).not.toBe("0");
    }
  });

  test("the arrows move focus and skip disabled options", () => {
    render(() => <Fruits />);
    const list = screen.getByRole("listbox");
    const options = screen.getAllByRole("option");

    user.focus(list);
    expect(document.activeElement).toBe(options[0] as HTMLElement);

    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(options[1] as HTMLElement);

    // Cherry is disabled, so Down lands on Date.
    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(options[3] as HTMLElement);

    user.keyDown("ArrowUp");
    expect(document.activeElement).toBe(options[1] as HTMLElement);
  });

  test("Home and End go to the ends", () => {
    render(() => <Fruits />);
    const list = screen.getByRole("listbox");
    const options = screen.getAllByRole("option");

    user.focus(list);
    user.keyDown("End");
    expect(document.activeElement).toBe(options[3] as HTMLElement);

    user.keyDown("Home");
    expect(document.activeElement).toBe(options[0] as HTMLElement);
  });

  test("focus does not leave the ends unless asked to wrap", () => {
    render(() => <Fruits />);
    const list = screen.getByRole("listbox");
    const options = screen.getAllByRole("option");

    user.focus(list);
    user.keyDown("ArrowUp");
    expect(document.activeElement).toBe(options[0] as HTMLElement);
  });

  test("wrapping goes round", () => {
    render(() => <Fruits shouldFocusWrap />);
    const list = screen.getByRole("listbox");
    const options = screen.getAllByRole("option");

    user.focus(list);
    user.keyDown("End");
    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(options[0] as HTMLElement);
  });

  test("Space selects the focused option", () => {
    const selections: string[][] = [];
    render(() => <Fruits onSelectionChange={(keys) => selections.push(keysOf(keys))} />);

    user.focus(screen.getByRole("listbox"));
    user.keyDown("ArrowDown");
    user.key(" ");

    expect(selections).toEqual([["banana"]]);
  });

  test("typing jumps to a matching option", () => {
    render(() => <Fruits />);
    const list = screen.getByRole("listbox");
    const options = screen.getAllByRole("option");

    user.focus(list);
    user.keyDown("d");

    expect(document.activeElement).toBe(options[3] as HTMLElement);
  });

  test("the items are data, so changing them updates the list", () => {
    const [items, setItems] = createSignal<Fruit[]>([{ id: "a", name: "Apple" }]);
    render(() => (
      <ListBox label="Fruit" items={items()} selectionMode="single">
        {(fruit: Fruit) => <Option>{fruit.name}</Option>}
      </ListBox>
    ));

    expect(screen.getAllByRole("option")).toHaveLength(1);

    setItems([
      { id: "a", name: "Apple" },
      { id: "b", name: "Banana" },
    ]);
    flush();

    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Fruits />);
    expectNoAriaViolations(container);
  });
});

describe("a section", () => {
  const GROUPS = [
    {
      id: "fruit",
      name: "Fruit",
      options: [
        { id: "apple", name: "Apple" },
        { id: "pear", name: "Pear" },
      ],
    },
    { id: "veg", name: "Veg", options: [{ id: "leek", name: "Leek" }] },
  ];

  function Grouped() {
    return (
      <ListBox
        items={GROUPS}
        aria-label="Produce"
        selectionMode="single"
        getChildren={(group: { options?: unknown[] }) =>
          group.options as { id: string; name: string; options?: unknown[] }[] | undefined
        }
      >
        {(value: { id: string; name: string; options?: unknown[] }) =>
          value.options === undefined ? (
            <Option>{value.name}</Option>
          ) : (
            <Section title={value.name} />
          )
        }
      </ListBox>
    );
  }

  test("the options inside are built by the list's own callback", () => {
    // Passing the callback to each section by hand is how the two come to
    // disagree about what an option looks like.
    render(() => <Grouped />);
    expect(screen.getAllByRole("option").map((each) => each.textContent)).toEqual([
      "Apple",
      "Pear",
      "Leek",
    ]);
  });

  test("it is a group a screen reader can name", () => {
    render(() => <Grouped />);
    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(2);
    const named = groups[0]?.getAttribute("aria-labelledby");
    expect(named).not.toBeNull();
    expect(document.getElementById(named ?? "")?.textContent).toBe("Fruit");
  });

  test("the wrapper is not itself an option, or the list would count it", () => {
    render(() => <Grouped />);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  test("Down from the last of one section reaches the first of the next", async () => {
    // The collection links keys in document order ACROSS section boundaries,
    // so this needs nothing from the section itself.
    render(() => <Grouped />);
    const list = screen.getByRole("listbox");
    list.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Leek");
  });
});

/**
 * The same listbox with its options WRITTEN rather than rendered from data.
 * Each one says what it is, and the collection is whatever rendered.
 */
describe("a listbox whose options are its children", () => {
  function Written(props: {
    onSelectionChange?: (keys: "all" | Set<Key>) => void;
    showBanana?: boolean;
    hideDate?: boolean;
    onAction?: () => void;
  }) {
    return (
      <ListBox label="Fruit" selectionMode="single" onSelectionChange={props.onSelectionChange}>
        <Option value="apple" onAction={props.onAction}>
          Apple
        </Option>
        <Show when={props.showBanana !== false}>
          <Option value="banana">Banana</Option>
        </Show>
        <Option value="cherry" isDisabled>
          Cherry
        </Option>
        <Option value="date" isHidden={props.hideDate === true}>
          Date
        </Option>
      </ListBox>
    );
  }

  test("is the same listbox: named, with one option per child", () => {
    render(() => <Written />);
    flush();

    expect(accessibleName(screen.getByRole("listbox"))).toBe("Fruit");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Apple",
      "Banana",
      "Cherry",
      "Date",
    ]);
    expectNoAriaViolations(screen.getByRole("listbox"));
  });

  test("the arrows walk the written options and skip a disabled one", () => {
    render(() => <Written />);
    flush();
    const options = screen.getAllByRole("option");

    user.focus(screen.getByRole("listbox"));
    expect(document.activeElement).toBe(options[0] as HTMLElement);
    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(options[1] as HTMLElement);
    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(options[3] as HTMLElement);
    expect(options[2]?.getAttribute("aria-disabled")).toBe("true");
  });

  test("an option's value is its key in the selection", () => {
    const selections: string[][] = [];
    render(() => <Written onSelectionChange={(keys) => selections.push(keysOf(keys))} />);
    flush();

    user.click(screen.getByText("Banana"));
    flush();
    expect(selections).toEqual([["banana"]]);
    expect(screen.getByText("Banana").getAttribute("aria-selected")).toBe("true");
  });

  test("an option can say what choosing it does", () => {
    let chosen = 0;
    render(() => <Written onAction={() => chosen++} />);
    flush();

    user.focus(screen.getByRole("listbox"));
    user.key("Enter");
    expect(chosen).toBe(1);
  });

  test("typing jumps to the option whose own text matches", () => {
    render(() => <Written />);
    flush();

    user.focus(screen.getByRole("listbox"));
    user.keyDown("d");
    expect(document.activeElement?.textContent).toBe("Date");
  });

  test("an option a <Show> takes away leaves the keyboard's path", () => {
    const [banana, setBanana] = createSignal(true);
    render(() => <Written showBanana={banana()} />);
    flush();

    setBanana(false);
    flush();
    user.focus(screen.getByRole("listbox"));
    user.keyDown("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Date");
  });

  test("a hidden option stays in the document and out of the keyboard's path", () => {
    render(() => <Written hideDate />);
    flush();

    expect(screen.getByText("Date").hasAttribute("hidden")).toBe(true);
    user.focus(screen.getByRole("listbox"));
    user.keyDown("End");
    expect(document.activeElement?.textContent).toBe("Banana");
  });

  function Heading(props: { children?: Child }) {
    const headingId = useSectionHeading();
    return (
      <li role="presentation" id={headingId?.()}>
        {props.children}
      </li>
    );
  }

  function WrittenGroups() {
    return (
      <ListBox aria-label="Food" selectionMode="single">
        <Section title="Fruit">
          <Option value="apple">Apple</Option>
          <Option value="pear">Pear</Option>
        </Section>
        <Section>
          <Heading>Vegetables</Heading>
          <Option value="leek">Leek</Option>
        </Section>
      </ListBox>
    );
  }

  test("a section is a group named by its title, or by a heading written inside it", () => {
    render(() => <WrittenGroups />);
    flush();

    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(2);
    expect(
      groups.map(
        (group) =>
          document.getElementById(group.getAttribute("aria-labelledby") ?? "")?.textContent,
      ),
    ).toEqual(["Fruit", "Vegetables"]);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  test("Down from the last of one written section reaches the first of the next", async () => {
    render(() => <WrittenGroups />);
    flush();

    screen.getByRole("listbox").focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Leek");
  });

  test("a value an id cannot hold still gives each option an id of its own", () => {
    // `aria-activedescendant` is a list of ids separated by spaces, so an id
    // holding one names two elements, neither of which exists.
    render(() => (
      <ListBox aria-label="Cities" selectionMode="single">
        <Option value="New York">New York</Option>
        <Option value="New-York">New-York</Option>
        <Option value="New_York">New_York</Option>
      </ListBox>
    ));
    flush();

    const ids = screen.getAllByRole("option").map((option) => option.id);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z][\w:.-]*$/);
  });
});

describe("drag and drop", () => {
  interface Animal {
    id: string;
    name: string;
  }

  const ANIMALS: Animal[] = [
    { id: "cat", name: "Cat" },
    { id: "dog", name: "Dog" },
    { id: "kangaroo", name: "Kangaroo" },
  ];

  function Animals(props: {
    label?: string;
    options?: Partial<DragAndDropOptions<Animal>>;
    selectionMode?: "none" | "single" | "multiple";
    disabledKeys?: Key[];
    orientation?: "horizontal" | "vertical";
    items?: Animal[];
    onAction?: () => void;
  }) {
    const { dragAndDropHooks } = dragAndDrop<Animal>({
      getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
      ...props.options,
    });
    return (
      <ListBox
        aria-label={props.label ?? "Animals"}
        items={props.items ?? ANIMALS}
        getTextValue={(animal: Animal) => animal.name}
        selectionMode={props.selectionMode ?? "none"}
        disabledKeys={props.disabledKeys}
        orientation={props.orientation}
        dragAndDropHooks={dragAndDropHooks}
      >
        {(animal: Animal) => <Option onAction={props.onAction}>{animal.name}</Option>}
      </ListBox>
    );
  }

  const indicator = (
    target: Parameters<NonNullable<DragAndDropOptions["renderDropIndicator"]>>[0],
  ) => (
    <DropIndicator target={target} class="indicator">
      Test
    </DropIndicator>
  );

  async function startDrag(option: HTMLElement, options: { altKey?: boolean } = {}) {
    user.keyDown("Enter", { target: option, ...options });
    user.keyUp("Enter", { target: option, ...options });
    await nextFrame();
  }

  function press(key: string) {
    user.keyDown(key);
    user.keyUp(key);
  }

  function described(element: Element): string | null | undefined {
    return document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;
  }

  afterEach(async () => {
    if (dragSession() !== null) press("Escape");
    await nextFrame();
    clearAnnouncer();
  });

  test("options are draggable", () => {
    render(() => <Animals />);
    // The description follows the modality, and Tab makes it the keyboard.
    user.tab();
    const [cat] = screen.getAllByRole("option");
    expect(cat?.getAttribute("draggable")).toBe("true");
    expect(cat?.hasAttribute("data-allows-dragging")).toBe(true);
    expect(cat?.hasAttribute("data-dragging")).toBe(false);
    expect(described(cat as Element)).toBe("Press Enter to start dragging.");
  });

  test("a list without hooks is unchanged", () => {
    render(() => (
      <ListBox aria-label="Plain" items={ANIMALS}>
        {(animal: Animal) => <Option>{animal.name}</Option>}
      </ListBox>
    ));
    const [cat] = screen.getAllByRole("option");
    expect(cat?.hasAttribute("draggable")).toBe(false);
    expect(cat?.hasAttribute("data-allows-dragging")).toBe(false);
  });

  test("renders drop indicators and reorders from the keyboard", async () => {
    const onReorder = mock((_event: DroppableCollectionReorderEvent) => {});
    render(() => <Animals options={{ onReorder, renderDropIndicator: indicator }} />);

    const cat = screen.getAllByRole("option")[0] as HTMLElement;
    await startDrag(cat);
    expect(cat.hasAttribute("data-dragging")).toBe(true);

    const options = screen
      .getAllByRole("option")
      .filter((option) => option.classList.contains("indicator"));
    expect(options.map((option) => option.getAttribute("aria-label"))).toEqual([
      "Insert before Cat",
      "Insert between Cat and Dog",
      "Insert between Dog and Kangaroo",
      "Insert after Kangaroo",
    ]);
    expect(options[0]?.hasAttribute("data-drop-target")).toBe(true);
    expect(options[0]?.textContent).toBe("Test");
    expect(options[0]?.getAttribute("aria-roledescription")).toBe("drop indicator");
    expect(options[1]?.hasAttribute("data-drop-target")).toBe(false);
    expect(document.activeElement).toBe(options[0] as HTMLElement);
    expect(announcements()).toContain("Insert before Cat");

    press("ArrowDown");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Insert between Cat and Dog");
    expect(options[0]?.hasAttribute("data-drop-target")).toBe(false);
    expect(options[1]?.hasAttribute("data-drop-target")).toBe(true);

    press("Enter");
    await nextFrame();
    expect(onReorder).toHaveBeenCalledTimes(1);
    const event = onReorder.mock.calls[0]?.[0];
    expect([...(event?.keys ?? [])]).toEqual(["cat"]);
    expect(event?.target).toEqual({ type: "item", key: "dog", dropPosition: "before" });
    expect(event?.dropOperation).toBe("move");
    expect(cat.hasAttribute("data-dragging")).toBe(false);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  test("the default indicator is an option with no content", async () => {
    render(() => <Animals options={{ onReorder: () => {} }} />);
    await startDrag(screen.getAllByRole("option")[0] as HTMLElement);
    const active = document.activeElement as HTMLElement;
    expect(active.getAttribute("role")).toBe("option");
    expect(active.getAttribute("data-slot")).toBe("drop-indicator");
    expect(active.textContent).toBe("");
    expect(active.getAttribute("tabindex")).toBe("-1");
  });

  test("does not skip drop positions next to a disabled option", async () => {
    render(() => <Animals disabledKeys={["dog"]} options={{ onReorder: () => {} }} />);
    await startDrag(screen.getAllByRole("option")[0] as HTMLElement);
    const labels = ["Insert before Cat"];
    for (let i = 0; i < 3; i++) {
      press("ArrowDown");
      labels.push(document.activeElement?.getAttribute("aria-label") ?? "");
    }
    expect(labels).toEqual([
      "Insert before Cat",
      "Insert between Cat and Dog",
      "Insert between Dog and Kangaroo",
      "Insert after Kangaroo",
    ]);
  });

  test("a disabled option does not drag", () => {
    render(() => <Animals disabledKeys={["dog"]} options={{ onReorder: () => {} }} />);
    const dog = screen.getAllByRole("option")[1] as HTMLElement;
    expect(dog.hasAttribute("draggable")).toBe(false);
  });

  test("Escape cancels", async () => {
    const onDragEnd = mock((_event: { keys: Set<Key> }) => {});
    const onReorder = mock();
    render(() => <Animals options={{ onReorder, onDragEnd }} />);
    const cat = screen.getAllByRole("option")[0] as HTMLElement;
    await startDrag(cat);
    press("ArrowDown");
    press("Escape");
    expect(onReorder).not.toHaveBeenCalled();
    expect(onDragEnd.mock.calls[0]?.[0]).toMatchObject({
      dropOperation: "cancel",
      isInternal: false,
    });
    expect([...(onDragEnd.mock.calls[0]?.[0].keys ?? [])]).toEqual(["cat"]);
    expect(document.activeElement).toBe(cat);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  test("drops on an option of another list", async () => {
    const onItemDrop = mock();
    render(() => (
      <>
        <Animals label="From" />
        <Animals label="To" options={{ onItemDrop }} />
      </>
    ));
    await startDrag(screen.getAllByRole("option")[0] as HTMLElement);

    const to = screen.getByRole("listbox", { name: "To" });
    const options = within(to).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]?.hasAttribute("data-drop-target")).toBe(true);
    expect(options[1]?.hasAttribute("data-drop-target")).toBe(false);
    expect(document.activeElement).toBe(options[0] as HTMLElement);

    press("Enter");
    await nextFrame();
    expect(onItemDrop).toHaveBeenCalledTimes(1);
    expect(onItemDrop.mock.calls[0]?.[0]).toMatchObject({
      isInternal: false,
      dropOperation: "move",
      target: { type: "item", key: "cat", dropPosition: "on" },
    });
  });

  test("drops on another list itself", async () => {
    const onRootDrop = mock();
    render(() => (
      <>
        <Animals label="From" />
        <Animals label="To" options={{ onRootDrop }} />
      </>
    ));
    await startDrag(screen.getAllByRole("option")[0] as HTMLElement);

    const to = screen.getByRole("listbox", { name: "To" });
    expect(document.activeElement).toBe(to);
    expect(to.hasAttribute("data-drop-target")).toBe(true);

    press("Enter");
    await nextFrame();
    expect(onRootDrop).toHaveBeenCalledTimes(1);
    expect(to.hasAttribute("data-drop-target")).toBe(false);
  });

  test("inserts into another list, and selects and focuses what arrived", async () => {
    const [animals, setAnimals] = createSignal<Animal[]>([
      { id: "lion", name: "Lion" },
      { id: "tiger", name: "Tiger" },
    ]);
    const onInsert = mock(async (event: { items: unknown[]; target: { key: Key } }) => {
      expect(event.target.key).toBe("lion");
      setAnimals((current) => [...current, { id: "cat-copy", name: "Cat copy" }]);
    });
    render(() => (
      <>
        <Animals label="From" />
        <Animals label="To" selectionMode="multiple" items={animals()} options={{ onInsert }} />
      </>
    ));
    await startDrag(screen.getAllByRole("option")[0] as HTMLElement);
    press("Enter");
    await nextFrame();
    await new Promise((resolve) => setTimeout(resolve, 60));
    flush();
    expect(onInsert).toHaveBeenCalledTimes(1);
    const arrived = screen.getByRole("option", { name: "Cat copy" });
    expect(arrived.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(arrived);
  });

  test("Tab moves between lists", async () => {
    render(() => (
      <>
        <Animals label="From" options={{ onReorder: () => {} }} />
        <Animals label="To" options={{ onInsert: () => {} }} />
      </>
    ));
    await startDrag(screen.getAllByRole("option")[0] as HTMLElement);
    const from = screen.getByRole("listbox", { name: "From" });
    const to = screen.getByRole("listbox", { name: "To" });
    expect(from.contains(document.activeElement)).toBe(true);

    user.tab();
    expect(to.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Insert before Cat");
  });

  test("drags every selected option, and drops after the selection", async () => {
    const onDragStart = mock((_event: { keys: Set<Key> }) => {});
    const onReorder = mock((_event: DroppableCollectionReorderEvent) => {});
    render(() => <Animals selectionMode="multiple" options={{ onDragStart, onReorder }} />);
    const [cat, dog] = screen.getAllByRole("option");
    user.click(cat as HTMLElement);
    user.click(dog as HTMLElement);
    expect(described(dog as HTMLElement)).toBe("Click to start dragging.");
    user.tab();
    expect(described(dog as HTMLElement)).toBe("Press Enter to drag 2 selected items.");

    await startDrag(dog as HTMLElement);
    expect([...(onDragStart.mock.calls[0]?.[0].keys ?? [])]).toEqual(["cat", "dog"]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Insert between Dog and Kangaroo",
    );
    press("ArrowDown");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Insert after Kangaroo");
    press("Enter");
    await nextFrame();
    expect([...(onReorder.mock.calls[0]?.[0].keys ?? [])]).toEqual(["cat", "dog"]);
    expect(onReorder.mock.calls[0]?.[0].target).toEqual({
      type: "item",
      key: "kangaroo",
      dropPosition: "after",
    });
  });

  test("an option with an action starts a drag on Alt + Enter", async () => {
    const onAction = mock();
    const onDragStart = mock();
    render(() => (
      <Animals selectionMode="multiple" onAction={onAction} options={{ onDragStart }} />
    ));
    const cat = screen.getAllByRole("option")[0] as HTMLElement;
    user.tab();
    expect(described(cat)).toBe("Press Alt + Enter to start dragging.");

    cat.focus();
    flush();
    press("Enter");
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledTimes(1);

    await startDrag(cat, { altKey: true });
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  test("a horizontal list moves between positions with Left and Right", async () => {
    const onReorder = mock((_event: DroppableCollectionReorderEvent) => {});
    render(() => <Animals orientation="horizontal" options={{ onReorder }} />);
    await startDrag(screen.getAllByRole("option")[0] as HTMLElement);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Insert before Cat");
    press("ArrowRight");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Insert between Cat and Dog");
    press("ArrowRight");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Insert between Dog and Kangaroo",
    );
    press("ArrowLeft");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Insert between Cat and Dog");
    press("Enter");
    await nextFrame();
    expect(onReorder.mock.calls[0]?.[0].target).toEqual({
      type: "item",
      key: "dog",
      dropPosition: "before",
    });
  });

  test("a pointer drag reorders through the point under it", async () => {
    const rects = stubRects(function (this: HTMLElement) {
      const index = ANIMALS.findIndex((animal) => animal.id === this.dataset.key);
      const top = index < 0 ? 0 : index * 50;
      const height = index < 0 ? 150 : 50;
      const rect = {
        left: 0,
        right: 100,
        top,
        bottom: top + height,
        x: 0,
        y: top,
        width: 100,
        height,
      };
      return { ...rect, toJSON: () => rect };
    });
    const onReorder = mock((_event: DroppableCollectionReorderEvent) => {});
    const onDragEnd = mock();
    const onDropEnter = mock();
    render(() => (
      <Animals
        options={{
          onReorder,
          onDragEnd,
          renderDropIndicator: indicator,
          onDropEnter,
        }}
      />
    ));
    const list = screen.getByRole("listbox");
    const cat = screen.getAllByRole("option")[0] as HTMLElement;

    const dataTransfer = new MockDataTransfer();
    fireDrag(cat, "dragstart", { dataTransfer, clientX: 50, clientY: 25 });
    expect(dataTransfer.entries()).toEqual([{ type: "text/plain", data: "cat" }]);
    await nextFrame();
    expect(cat.hasAttribute("data-dragging")).toBe(true);

    fireDrag(list, "dragenter", { dataTransfer, clientX: 50, clientY: 60 });
    fireDrag(list, "dragover", { dataTransfer, clientX: 50, clientY: 60 });
    const target = list.querySelector("[data-drop-target]");
    expect(target?.getAttribute("aria-label")).toBe("Insert between Cat and Dog");
    expect(onDropEnter.mock.calls[0]?.[0]).toMatchObject({
      type: "dropenter",
      target: { type: "item", key: "dog", dropPosition: "before" },
    });
    expect(dataTransfer.dropEffect).toBe("move");

    fireDrag(list, "drop", { dataTransfer, clientX: 50, clientY: 60 });
    expect(onReorder.mock.calls[0]?.[0].target).toEqual({
      type: "item",
      key: "dog",
      dropPosition: "before",
    });
    fireDrag(cat, "dragend", { dataTransfer, clientX: 50, clientY: 60 });
    expect(onDragEnd.mock.calls[0]?.[0]).toMatchObject({
      dropOperation: "move",
      isInternal: true,
    });
    expect(cat.hasAttribute("data-dragging")).toBe(false);
    rects.mockRestore();
  });

  test("a pointer drag over a refusing option falls back to the list", async () => {
    const onRootDrop = mock();
    render(() => (
      <>
        <Animals label="From" />
        <Animals label="To" options={{ onRootDrop }} />
      </>
    ));
    const to = screen.getByRole("listbox", { name: "To" });
    const dataTransfer = new MockDataTransfer();
    const cat = screen.getAllByRole("option")[0] as HTMLElement;
    fireDrag(cat, "dragstart", { dataTransfer });
    fireDrag(to, "dragenter", { dataTransfer });
    fireDrag(to, "dragover", { dataTransfer, clientX: 1, clientY: 1 });
    expect(to.hasAttribute("data-drop-target")).toBe(true);
    fireDrag(to, "drop", { dataTransfer, clientX: 1, clientY: 1 });
    expect(onRootDrop).toHaveBeenCalledTimes(1);
    fireDrag(cat, "dragend", { dataTransfer });
  });

  test("positions are named within their section", async () => {
    const GROUPS = [
      {
        id: "people",
        name: "People",
        options: [
          { id: "salama", name: "Salama" },
          { id: "ali", name: "Ali" },
        ],
      },
      { id: "companies", name: "Companies", options: [{ id: "acme", name: "Acme" }] },
    ];
    type Group = { id: string; name: string; options?: Group[] };

    function Grouped() {
      const { dragAndDropHooks } = dragAndDrop<Group>({
        getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
        onMove: () => {},
        renderDropIndicator: indicator,
      });
      return (
        <ListBox
          items={GROUPS}
          aria-label="Contacts"
          getChildren={(group: Group) => group.options}
          dragAndDropHooks={dragAndDropHooks}
        >
          {(value: Group) =>
            value.options === undefined ? (
              <Option>{value.name}</Option>
            ) : (
              <Section title={value.name} />
            )
          }
        </ListBox>
      );
    }

    render(() => <Grouped />);
    await startDrag(screen.getAllByRole("option")[0] as HTMLElement);
    const labels = [...document.querySelectorAll(".indicator")].map((each) =>
      each.getAttribute("aria-label"),
    );
    // The end of a section is not a position of its own; the end of the list is.
    expect(labels).toEqual([
      "Insert before Salama",
      "Insert between Salama and Ali",
      "Insert before Acme",
      "Insert after Acme",
    ]);
  });

  test("options written as children drag and drop too", async () => {
    const onReorder = mock((_event: DroppableCollectionReorderEvent) => {});
    function Written() {
      const { dragAndDropHooks } = dragAndDrop({
        getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
        onReorder,
      });
      return (
        <ListBox aria-label="Companies" dragAndDropHooks={dragAndDropHooks}>
          <Option value="acme">Acme</Option>
          <Option value="example">Example</Option>
        </ListBox>
      );
    }

    render(() => <Written />);
    flush();
    const acme = screen.getByRole("option", { name: "Acme" });
    expect(acme.getAttribute("draggable")).toBe("true");
    await startDrag(acme);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Insert before Acme");
    press("ArrowDown");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Insert between Acme and Example",
    );
    press("Enter");
    await nextFrame();
    expect(onReorder.mock.calls[0]?.[0].target).toEqual({
      type: "item",
      key: "example",
      dropPosition: "before",
    });
  });

  test("a drag preview is rendered for the drag", () => {
    render(() => (
      <Animals
        options={{
          renderDragPreview: (items) => <span data-testid="preview">{items.length} item</span>,
        }}
      />
    ));
    const dataTransfer = new MockDataTransfer();
    const cat = screen.getAllByRole("option")[0] as HTMLElement;
    fireDrag(cat, "dragstart", { dataTransfer });
    expect(dataTransfer.dragImage?.node.textContent).toBe("1 item");
    fireDrag(cat, "dragend", { dataTransfer });
  });
});

describe("actions and links", () => {
  interface Page {
    id: string;
    name: string;
    href?: string;
  }

  const PAGES: Page[] = [
    { id: "home", name: "Home" },
    { id: "docs", name: "Docs", href: "/docs" },
    { id: "blog", name: "Blog", href: "/blog" },
  ];

  function routed(opened: string[], content: () => Child): never {
    return provide(
      RouterContext,
      () => ({
        isNative: false,
        open: (_target: Element, _modifiers: object, href: string) => opened.push(href),
        href: (href: string) => href,
      }),
      content,
    ) as never;
  }

  test("the list's onAction is called with the key of the option acted on", () => {
    const acted: Key[] = [];
    render(() => (
      <ListBox aria-label="Fruit" items={FRUITS} onAction={(key: Key) => acted.push(key)}>
        {(fruit: Fruit) => <Option>{fruit.name}</Option>}
      </ListBox>
    ));

    user.click(screen.getByRole("option", { name: "Banana" }));
    user.focus(screen.getByRole("option", { name: "Apple" }));
    user.key("Enter");
    expect(acted).toEqual(["banana", "apple"]);
  });

  test("an option's own onAction and the list's both run", () => {
    const acted: string[] = [];
    render(() => (
      <ListBox aria-label="Fruit" items={FRUITS} onAction={(key: Key) => acted.push(`list ${key}`)}>
        {(fruit: Fruit) => (
          <Option onAction={() => acted.push(`own ${fruit.id}`)}>{fruit.name}</Option>
        )}
      </ListBox>
    ));

    user.click(screen.getByRole("option", { name: "Apple" }));
    expect(acted).toEqual(["own apple", "list apple"]);
  });

  test("an item with an href is a link the router follows", () => {
    const opened: string[] = [];
    render(() =>
      routed(opened, () => (
        <ListBox aria-label="Pages" items={PAGES}>
          {(page: Page) => <Option>{page.name}</Option>}
        </ListBox>
      )),
    );

    const docs = screen.getByRole("option", { name: "Docs" });
    expect(docs.getAttribute("data-href")).toBe("/docs");
    expect(screen.getByRole("option", { name: "Home" }).hasAttribute("data-href")).toBe(false);

    user.click(docs);
    expect(opened).toEqual(["/docs"]);

    user.keyDown("ArrowDown");
    user.key("Enter");
    expect(opened).toEqual(["/docs", "/blog"]);
  });

  test("under toggle selection a link is never selected, only followed", () => {
    // Nothing inside a listbox can select a link under toggle selection, so
    // the link always wins rather than only while nothing is selected.
    const opened: string[] = [];
    const selections: string[][] = [];
    render(() =>
      routed(opened, () => (
        <ListBox
          aria-label="Pages"
          items={PAGES}
          selectionMode="single"
          onSelectionChange={(keys) => selections.push(keysOf(keys))}
        >
          {(page: Page) => <Option>{page.name}</Option>}
        </ListBox>
      )),
    );

    user.click(screen.getByRole("option", { name: "Home" }));
    user.click(screen.getByRole("option", { name: "Docs" }));
    expect(selections).toEqual([["home"]]);
    expect(opened).toEqual(["/docs"]);
  });

  test("a written option can be a link", () => {
    const opened: string[] = [];
    render(() =>
      routed(opened, () => (
        <ListBox aria-label="Pages">
          <Option value="home">Home</Option>
          <Option value="docs" href="/docs" target="_self">
            Docs
          </Option>
        </ListBox>
      )),
    );
    flush();

    const docs = screen.getByRole("option", { name: "Docs" });
    expect(docs.getAttribute("data-href")).toBe("/docs");
    expect(docs.getAttribute("data-target")).toBe("_self");
    user.click(docs);
    expect(opened).toEqual(["/docs"]);
  });
});

describe("options of the list", () => {
  test("Page Down and Page Up reach the ends of a list that does not scroll", () => {
    render(() => <Fruits />);
    const options = screen.getAllByRole("option");

    user.focus(screen.getByRole("listbox"));
    user.keyDown("PageDown");
    expect(document.activeElement).toBe(options[3] as HTMLElement);
    user.keyDown("PageUp");
    expect(document.activeElement).toBe(options[0] as HTMLElement);
  });

  test("the orientation is always stated, vertical by default", () => {
    render(() => <Fruits />);
    const list = screen.getByRole("listbox");
    expect(list.getAttribute("aria-orientation")).toBe("vertical");
    expect(list.getAttribute("data-orientation")).toBe("vertical");
    expect(list.getAttribute("data-layout")).toBe("stack");
  });

  test("the list writes data-focused and data-focus-visible while it holds focus itself", () => {
    // An empty list is a Tab stop of its own; a full one hands focus to an option.
    render(() => (
      <ListBox aria-label="Fruit" items={[] as Fruit[]}>
        {(fruit: Fruit) => <Option>{fruit.name}</Option>}
      </ListBox>
    ));
    const list = screen.getByRole("listbox");
    expect(list.hasAttribute("data-focused")).toBe(false);

    user.tab();
    expect(document.activeElement).toBe(list);
    expect(list.hasAttribute("data-focused")).toBe(true);
    expect(list.hasAttribute("data-focus-visible")).toBe(true);
  });

  test("an option writes its selection mode", () => {
    render(() => <Fruits selectionMode="multiple" />);
    expect(screen.getAllByRole("option")[0]?.getAttribute("data-selection-mode")).toBe("multiple");
  });

  test("an option with nothing to do is not hovered", () => {
    render(() => (
      <ListBox aria-label="Fruit" items={FRUITS}>
        {(fruit: Fruit) => <Option>{fruit.name}</Option>}
      </ListBox>
    ));
    const apple = screen.getByRole("option", { name: "Apple" });
    user.hover(apple);
    expect(apple.hasAttribute("data-hovered")).toBe(false);
  });

  test("a grid layout moves across with Left and Right and down by rows", () => {
    // Two columns: an option's box is read from its index.
    const rects = stubRects(function (this: HTMLElement) {
      const index = FRUITS.findIndex((fruit) => fruit.id === this.dataset.key);
      const rect =
        index < 0
          ? { left: 0, top: 0, width: 200, height: 100 }
          : { left: (index % 2) * 100, top: Math.floor(index / 2) * 50, width: 100, height: 50 };
      const full = {
        ...rect,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        x: rect.left,
        y: rect.top,
      };
      return { ...full, toJSON: () => full };
    });
    const items = FRUITS.map((fruit) => ({ ...fruit, isDisabled: false }));
    render(() => (
      <ListBox aria-label="Fruit" items={items} layout="grid">
        {(fruit: Fruit) => <Option>{fruit.name}</Option>}
      </ListBox>
    ));
    const options = screen.getAllByRole("option");
    expect(screen.getByRole("listbox").getAttribute("data-layout")).toBe("grid");

    user.focus(screen.getByRole("listbox"));
    user.keyDown("ArrowRight");
    expect(document.activeElement).toBe(options[1] as HTMLElement);
    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(options[3] as HTMLElement);
    user.keyDown("ArrowLeft");
    expect(document.activeElement).toBe(options[2] as HTMLElement);
    rects.mockRestore();
  });

  test("a keyboard delegate of the caller's own decides where the keys go", () => {
    const delegate: KeyboardDelegate = {
      getFirstKey: () => "date",
      getLastKey: () => "apple",
      getKeyBelow: (key) => (key === "date" ? "banana" : null),
      getKeyAbove: () => null,
    };
    render(() => (
      <ListBox aria-label="Fruit" keyboardDelegate={delegate}>
        <Option value="apple">Apple</Option>
        <Option value="banana">Banana</Option>
        <Option value="date">Date</Option>
      </ListBox>
    ));
    flush();

    user.focus(screen.getByRole("listbox"));
    expect(document.activeElement?.textContent).toBe("Date");
    user.keyDown("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Banana");
    user.keyDown("End");
    expect(document.activeElement?.textContent).toBe("Apple");
  });

  test("shouldSelectOnPressUp selects on release, not on press", () => {
    const selections: string[][] = [];
    render(() => (
      <ListBox
        aria-label="Fruit"
        items={FRUITS}
        selectionMode="single"
        shouldSelectOnPressUp
        onSelectionChange={(keys) => selections.push(keysOf(keys))}
      >
        {(fruit: Fruit) => <Option>{fruit.name}</Option>}
      </ListBox>
    ));
    const banana = screen.getByRole("option", { name: "Banana" });

    user.pointerDown(banana);
    flush();
    expect(selections).toEqual([]);
    user.pointerUp(banana);
    user.click(banana);
    flush();
    expect(selections).toEqual([["banana"]]);
  });

  test("replace selection selects as focus moves", () => {
    const selections: string[][] = [];
    render(() => (
      <ListBox
        aria-label="Fruit"
        items={FRUITS}
        selectionMode="multiple"
        selectionBehavior="replace"
        onSelectionChange={(keys) => selections.push(keysOf(keys))}
      >
        {(fruit: Fruit) => <Option>{fruit.name}</Option>}
      </ListBox>
    ));

    user.tab();
    user.keyDown("ArrowDown");
    expect(selections.at(-1)).toEqual(["banana"]);
  });

  test("escapeKeyBehavior none keeps the selection on Escape", () => {
    const selections: string[][] = [];
    render(() => (
      <ListBox
        aria-label="Fruit"
        items={FRUITS}
        selectionMode="multiple"
        escapeKeyBehavior="none"
        onSelectionChange={(keys) => selections.push(keysOf(keys))}
      >
        {(fruit: Fruit) => <Option>{fruit.name}</Option>}
      </ListBox>
    ));

    user.click(screen.getByRole("option", { name: "Apple" }));
    user.keyDown("Escape");
    expect(selections).toEqual([["apple"]]);
  });

  test("an option hears its own keys, presses, hovers and focus", () => {
    const seen: string[] = [];
    render(() => (
      <ListBox aria-label="Fruit" items={FRUITS} selectionMode="single">
        {(fruit: Fruit) => (
          <Option
            onKeyDown={(event) => {
              seen.push(`down ${event.key}`);
              event.continuePropagation();
            }}
            onKeyUp={(event) => seen.push(`up ${event.key}`)}
            onPressStart={() => seen.push("press start")}
            onPress={() => seen.push("press")}
            onHoverStart={() => seen.push("hover")}
            onFocus={() => seen.push(`focus ${fruit.id}`)}
            onBlur={() => seen.push(`blur ${fruit.id}`)}
          >
            {fruit.name}
          </Option>
        )}
      </ListBox>
    ));

    const apple = screen.getByRole("option", { name: "Apple" });
    user.hover(apple);
    user.click(apple);
    expect(seen).toEqual(["hover", "press start", "focus apple", "press"]);

    seen.length = 0;
    user.key("ArrowDown");
    // The release lands on the option focus moved to.
    expect(seen).toEqual(["down ArrowDown", "blur apple", "focus banana", "up ArrowDown"]);
    expect(document.activeElement?.textContent).toBe("Banana");
  });

  test("shouldFocusOnHover moves focus to the option under the pointer", () => {
    render(() => (
      <ListBox aria-label="Fruit" items={FRUITS} selectionMode="single" shouldFocusOnHover>
        {(fruit: Fruit) => <Option>{fruit.name}</Option>}
      </ListBox>
    ));
    const banana = screen.getByRole("option", { name: "Banana" });
    user.hover(banana);
    flush();
    expect(document.activeElement?.textContent).toBe("Banana");
    user.keyDown("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Date");
  });

  test("the list hears focus entering and leaving it", () => {
    const seen: string[] = [];
    render(() => (
      <>
        <ListBox
          aria-label="Fruit"
          items={FRUITS}
          onFocus={() => seen.push("focus")}
          onBlur={() => seen.push("blur")}
          onFocusChange={(focused: boolean) => seen.push(`change ${focused}`)}
        >
          {(fruit: Fruit) => <Option>{fruit.name}</Option>}
        </ListBox>
        <button type="button">After</button>
      </>
    ));

    user.tab();
    user.keyDown("ArrowDown");
    user.tab();
    expect(seen).toEqual(["focus", "change true", "blur", "change false"]);
  });

  test("an empty list renders its empty state", () => {
    render(() => (
      <ListBox
        aria-label="Fruit"
        items={[] as Fruit[]}
        renderEmptyState={(list) => <span>Nothing {list.isEmpty() ? "here" : "?"}</span>}
      >
        {(fruit: Fruit) => <Option>{fruit.name}</Option>}
      </ListBox>
    ));
    const list = screen.getByRole("listbox");
    expect(list.hasAttribute("data-empty")).toBe(true);
    expect(list.textContent).toBe("Nothing here");
  });
});

describe("a selection indicator", () => {
  const MOVES = { "transition-property": "translate", "transition-duration": "0ms" };

  test("is shown in the selected option only, and moves between options", async () => {
    render(() => (
      <ListBox
        aria-label="Fruit"
        items={FRUITS}
        selectionMode="single"
        defaultSelectedKeys={["banana"]}
      >
        {(fruit: Fruit) => (
          <Option>
            {fruit.name}
            <SelectionIndicator class="indicator" style={MOVES} />
          </Option>
        )}
      </ListBox>
    ));
    await new Promise((resolve) => setTimeout(resolve, 40));
    flush();

    const shown = [...document.querySelectorAll<HTMLElement>(".indicator")];
    expect(shown.map((each) => each.closest('[role="option"]')?.textContent)).toEqual(["Banana"]);
    const first = shown[0] as HTMLElement;
    first.getBoundingClientRect = () =>
      ({ left: 0, top: 30, width: 4, height: 20, right: 4, bottom: 50, x: 0, y: 30 }) as DOMRect;

    user.click(screen.getByRole("option", { name: "Date" }));
    flush();
    // One scope for the whole list: the new indicator starts where the old one was.
    const moved = screen
      .getByRole("option", { name: "Date" })
      .querySelector<HTMLElement>(".indicator");
    expect(moved?.style.translate).toBe("0px 30px");

    await new Promise((resolve) => setTimeout(resolve, 40));
    flush();
    expect(
      [...document.querySelectorAll(".indicator")].map(
        (each) => each.closest('[role="option"]')?.textContent,
      ),
    ).toEqual(["Date"]);
  });
});

describe("inside an autocomplete", () => {
  function Search() {
    const auto = useAutocompleteInput();
    const domRef = makeRef<HTMLInputElement>();
    const { inputProps, labelProps } = searchField(
      { label: "Fruit", ...auto?.inputOptions },
      domRef,
    );
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

  const contains = (textValue: string, inputValue: string): boolean =>
    textValue.toLowerCase().includes(inputValue.toLowerCase());

  function Example(props: { label?: string; onAction?: (key: Key) => void }) {
    return (
      <Autocomplete filter={contains}>
        <Search />
        <ListBox
          aria-label={props.label}
          items={FRUITS}
          getTextValue={(fruit: Fruit) => fruit.name}
          onAction={props.onAction}
        >
          {(fruit: Fruit) => <Option>{fruit.name}</Option>}
        </ListBox>
      </Autocomplete>
    );
  }

  const field = (): HTMLInputElement => screen.getByRole<HTMLInputElement>("searchbox");

  test("the field filters the options and controls the list", () => {
    render(() => <Example />);
    flush();
    const list = screen.getByRole("listbox");
    expect(field().getAttribute("aria-controls")).toBe(list.id);
    expect(accessibleName(list)).toBe("Suggestions");

    user.type(field(), "an");
    flush();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Banana"]);
  });

  test("the caller's own name wins over the autocomplete's", () => {
    render(() => <Example label="Fruit list" />);
    flush();
    expect(accessibleName(screen.getByRole("listbox"))).toBe("Fruit list");
  });

  test("the arrows highlight options virtually, and Enter acts on the highlighted one", () => {
    const acted: Key[] = [];
    render(() => <Example onAction={(key) => acted.push(key)} />);
    flush();

    user.focus(field());
    user.keyDown("ArrowDown");
    flush();
    const apple = screen.getByRole("option", { name: "Apple" });
    expect(field().getAttribute("aria-activedescendant")).toBe(apple.id);
    expect(document.activeElement).toBe(field());
    expect(apple.hasAttribute("tabindex")).toBe(false);

    user.key("Enter");
    flush();
    expect(acted).toEqual(["apple"]);
  });
});

describe("loading more", () => {
  interface Entry {
    id: string;
    name: string;
    kind?: "loader";
  }

  const PAGE: Entry[] = [
    { id: "apple", name: "Apple" },
    { id: "banana", name: "Banana" },
    { id: "loader", name: "Loading", kind: "loader" },
  ];

  function Loading(props: {
    items?: Entry[];
    isLoading?: boolean;
    onLoadMore?: () => void;
    renderEmptyState?: (list: ListBoxRenderState) => Child;
  }) {
    return (
      <ListBox
        aria-label="Fruit"
        items={props.items ?? PAGE}
        selectionMode="single"
        getType={(entry: Entry) => (entry.kind === "loader" ? "loader" : "item")}
        renderEmptyState={props.renderEmptyState}
      >
        {(entry: Entry) =>
          entry.kind === "loader" ? (
            <ListBoxLoadMoreItem isLoading={props.isLoading} onLoadMore={props.onLoadMore}>
              {entry.name}
            </ListBoxLoadMoreItem>
          ) : (
            <Option>{entry.name}</Option>
          )
        }
      </ListBox>
    );
  }

  test("the loading row is an option the keyboard skips", () => {
    render(() => <Loading isLoading />);
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Apple", "Banana", "Loading"]);
    const loader = options[2] as HTMLElement;
    expect(loader.getAttribute("tabindex")).toBe("-1");
    expect(loader.hasAttribute("aria-selected")).toBe(false);
    expect(loader.hasAttribute("aria-posinset")).toBe(false);

    user.tab();
    user.keyboard("{End}");
    flush();
    expect(document.activeElement?.textContent).toBe("Banana");
    user.keyboard("{ArrowDown}");
    flush();
    expect(document.activeElement?.textContent).toBe("Banana");
  });

  test("not loading, the sentinel is there and the row is not", () => {
    const { container } = render(() => <Loading />);
    expect(screen.getAllByRole("option")).toHaveLength(2);
    const sentinels = container.querySelectorAll("[data-load-more-sentinel]");
    expect(sentinels).toHaveLength(1);
    expect(sentinels[0]?.closest("[inert]")?.getAttribute("role")).toBe("presentation");
  });

  test("the sentinel asks for more when it comes into reach, loading or not", () => {
    const intersections = stubIntersections();
    try {
      let loads = 0;
      const [loading, setLoading] = createSignal(true);
      const [items, setItems] = createSignal(PAGE);
      render(() => <Loading items={items()} isLoading={loading()} onLoadMore={() => loads++} />);
      flush();
      expect(intersections.live()).toHaveLength(1);
      intersections.fire();
      expect(loads).toBe(1);

      setLoading(false);
      flush();
      intersections.fire();
      expect(loads).toBe(2);

      // A page arrived: the observer is rebuilt, so a sentinel still in reach
      // asks again.
      setItems([{ id: "cherry", name: "Cherry" }, ...PAGE]);
      flush();
      expect(intersections.live()).toHaveLength(1);
      intersections.fire();
      expect(loads).toBe(3);
    } finally {
      intersections.restore();
    }
  });

  test("a list holding only a loader is empty, and shows both", () => {
    const [loading, setLoading] = createSignal(true);
    render(() => (
      <Loading
        items={[{ id: "loader", name: "Loading", kind: "loader" }]}
        isLoading={loading()}
        renderEmptyState={(_list: ListBoxRenderState) => (loading() ? null : "No fruit")}
      />
    ));
    const list = screen.getByRole("listbox");
    expect(list.hasAttribute("data-empty")).toBe(true);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Loading",
      "",
    ]);

    setLoading(false);
    flush();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["No fruit"]);
  });

  test("written after the options of a list with no items", () => {
    const intersections = stubIntersections();
    try {
      let loads = 0;
      render(() => (
        <ListBox aria-label="Fruit" selectionMode="single">
          <Option value="apple">Apple</Option>
          <Option value="banana">Banana</Option>
          <ListBoxLoadMoreItem isLoading onLoadMore={() => loads++}>
            Loading
          </ListBoxLoadMoreItem>
        </ListBox>
      ));
      flush();
      expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
        "Apple",
        "Banana",
        "Loading",
      ]);
      intersections.fire();
      expect(loads).toBe(1);
      user.tab();
      user.keyboard("{End}");
      flush();
      expect(document.activeElement?.textContent).toBe("Banana");
    } finally {
      intersections.restore();
    }
  });

  test("the sentinel and the loading option add nothing a checker objects to", () => {
    const { container, unmount } = render(() => <Loading />);
    expectNoAriaViolations(container);
    unmount();
    const loading = render(() => <Loading isLoading />);
    expectNoAriaViolations(loading.container);
  });

  test("an empty state and a loader together have no ARIA violations", () => {
    const { container } = render(() => (
      <Loading
        items={[{ id: "loader", name: "Loading", kind: "loader" }]}
        isLoading
        renderEmptyState={(_list: ListBoxRenderState) => "No fruit"}
      />
    ));
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expectNoAriaViolations(container);
  });

  describe("virtualised", () => {
    const MANY: Entry[] = [
      ...Array.from({ length: 100 }, (_, at) => ({ id: `f${at}`, name: `Fruit ${at}` })),
      { id: "loader", name: "Loading", kind: "loader" as const },
    ];

    function scrollTo(element: HTMLElement, top: number): void {
      element.style.overflow = "auto";
      Object.defineProperty(element, "clientHeight", { value: 100, configurable: true });
      Object.defineProperty(element, "clientWidth", { value: 200, configurable: true });
      Object.defineProperty(element, "scrollTop", {
        value: top,
        writable: true,
        configurable: true,
      });
      element.dispatchEvent(new Event("scroll"));
      flush();
    }

    function Many(props: { isLoading?: boolean }) {
      return (
        <Virtualizer layout={listLayout({ rowHeight: 20, loaderHeight: 30 })} overscan={0}>
          <Loading items={MANY} isLoading={props.isLoading} />
        </Virtualizer>
      );
    }

    test("the loader is placed after the last row and is rendered wherever the scroll is", () => {
      const { container } = render(() => <Many isLoading />);
      const list = screen.getByRole("listbox");
      scrollTo(list, 0);

      const options = screen.getAllByRole("option");
      expect(options.length).toBeLessThan(20);
      const loader = options.at(-1) as HTMLElement;
      expect(loader.textContent).toBe("Loading");
      expect(loader.style.top).toBe("2000px");
      expect(loader.style.height).toBe("30px");
      expect(options[0]?.getAttribute("aria-setsize")).toBe("100");
      expect(list.style.height).toBe("2030px");

      const box = container.querySelector("[data-load-more-sentinel]")?.parentElement;
      expect(box?.style.position).toBe("absolute");
      expect(box?.style.top).toBe("2000px");
    });

    test("not loading, the loader takes no room", () => {
      render(() => <Many />);
      const list = screen.getByRole("listbox");
      scrollTo(list, 0);
      expect(list.style.height).toBe("2000px");
    });
  });
});
