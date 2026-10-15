import { describe, expect, test } from "bun:test";
import { flush, type Child, type Incoming, Show, createSignal } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import type { Key } from "./collections.ts";
import { ListBox, Option, Section, useSectionHeading } from "./listbox.tsx";

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
function Fruits(
  props: Incoming<{
    selectionMode?: "none" | "single" | "multiple";
    onSelectionChange?: (keys: "all" | Set<Key>) => void;
    disallowEmptySelection?: boolean;
    shouldFocusWrap?: boolean;
  }>,
) {
  return (
    <ListBox
      label="Fruit"
      items={FRUITS}
      selectionMode={props.selectionMode?.() ?? "single"}
      disallowEmptySelection={props.disallowEmptySelection?.()}
      shouldFocusWrap={props.shouldFocusWrap?.()}
      onSelectionChange={props.onSelectionChange?.()}
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
  function Written(
    props: Incoming<{
      onSelectionChange?: (keys: "all" | Set<Key>) => void;
      showBanana?: boolean;
      hideDate?: boolean;
      onAction?: () => void;
    }>,
  ) {
    return (
      <ListBox label="Fruit" selectionMode="single" onSelectionChange={props.onSelectionChange?.()}>
        <Option value="apple" onAction={props.onAction?.()}>
          Apple
        </Option>
        <Show when={props.showBanana?.() !== false}>
          <Option value="banana">Banana</Option>
        </Show>
        <Option value="cherry" isDisabled>
          Cherry
        </Option>
        <Option value="date" isHidden={props.hideDate?.() === true}>
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

  function Heading(props: Incoming<{ children?: Child }>) {
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
