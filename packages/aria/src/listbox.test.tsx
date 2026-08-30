import { describe, expect, test } from "bun:test";
import { flush, type Incoming, signal } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import type { Key } from "./collections.ts";
import { ListBox, Option } from "./listbox.tsx";

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
    const items = signal<Fruit[]>([{ id: "a", name: "Apple" }]);
    render(() => (
      <ListBox label="Fruit" items={items()} selectionMode="single">
        {(fruit: Fruit) => <Option>{fruit.name}</Option>}
      </ListBox>
    ));

    expect(screen.getAllByRole("option")).toHaveLength(1);

    items.set([
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
