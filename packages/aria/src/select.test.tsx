import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";
import type { Key } from "./collections.ts";
import { Option } from "./listbox.tsx";
import { Select } from "./select.tsx";

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

function Picker(
  props: Incoming<{
    defaultSelectedKey?: Key | null;
    name?: string;
    isDisabled?: boolean;
    onSelectionChange?: (key: Key | null) => void;
  }>,
) {
  return (
    <Select
      label="Fruit"
      items={FRUITS}
      placeholder="Pick one"
      name={props.name?.()}
      isDisabled={props.isDisabled?.()}
      defaultSelectedKey={props.defaultSelectedKey?.()}
      onSelectionChange={props.onSelectionChange?.()}
      getTextValue={(fruit: Fruit) => fruit.name}
    >
      {(fruit: Fruit) => <Option>{fruit.name}</Option>}
    </Select>
  );
}

function trigger(): HTMLElement {
  return screen.getByRole("button");
}

describe("Select", () => {
  test("is a button that says it opens a listbox", () => {
    render(() => <Picker />);

    expect(trigger().getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("the placeholder shows until something is chosen", () => {
    render(() => <Picker />);
    expect(trigger().textContent).toBe("Pick one");
  });

  test("the button is named by the label AND the value", () => {
    render(() => <Picker defaultSelectedKey="banana" />);
    expect(accessibleName(trigger())).toBe("Fruit Banana");
  });

  test("a press opens the listbox", async () => {
    render(() => <Picker />);

    user.click(trigger());
    await tick();

    expect(screen.getByRole("listbox")).not.toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  test("choosing an option sets the value and closes", async () => {
    const chosen: (Key | null)[] = [];
    render(() => <Picker onSelectionChange={(key) => chosen.push(key)} />);

    user.click(trigger());
    await tick();
    user.click(screen.getByRole("option", { name: "Banana" }));
    flush();

    expect(chosen).toEqual(["banana"]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger().textContent).toBe("Banana");
  });

  test("the chosen option is the selected one when it reopens", async () => {
    render(() => <Picker defaultSelectedKey="date" />);

    user.click(trigger());
    await tick();

    expect(screen.getByRole("option", { name: "Date" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Date");
  });

  test("ArrowDown opens with the first option focused", async () => {
    render(() => <Picker />);

    user.focus(trigger());
    user.keyDown("ArrowDown");
    await tick();

    expect(document.activeElement?.textContent).toBe("Apple");
  });

  test("ArrowUp opens with the last option focused", async () => {
    render(() => <Picker />);

    user.focus(trigger());
    user.keyDown("ArrowUp");
    await tick();

    expect(document.activeElement?.textContent).toBe("Date");
  });

  test("the arrows step through values without opening", () => {
    const chosen: (Key | null)[] = [];
    render(() => <Picker onSelectionChange={(key) => chosen.push(key)} />);

    user.focus(trigger());
    user.keyDown("ArrowRight");
    flush();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger().textContent).toBe("Apple");

    user.keyDown("ArrowRight");
    flush();
    expect(trigger().textContent).toBe("Banana");

    user.keyDown("ArrowLeft");
    flush();
    expect(trigger().textContent).toBe("Apple");

    expect(chosen).toEqual(["apple", "banana", "apple"]);
  });

  test("typing on the closed button jumps to a value", () => {
    render(() => <Picker />);

    user.focus(trigger());
    user.keyDown("d");
    flush();

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger().textContent).toBe("Date");
  });

  test("a disabled option cannot be chosen", async () => {
    const chosen: (Key | null)[] = [];
    render(() => <Picker onSelectionChange={(key) => chosen.push(key)} />);

    user.click(trigger());
    await tick();

    const cherry = screen.getByRole("option", { name: "Cherry" });
    expect(cherry.getAttribute("aria-disabled")).toBe("true");

    user.click(cherry);
    flush();
    expect(chosen).toEqual([]);
  });

  test("Escape closes without choosing", async () => {
    const chosen: (Key | null)[] = [];
    render(() => <Picker onSelectionChange={(key) => chosen.push(key)} />);

    user.click(trigger());
    await tick();
    user.keyDown("Escape");
    flush();

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(chosen).toEqual([]);
  });

  test("without a name there is no hidden control", () => {
    const { container } = render(() => <Picker />);
    expect(container.querySelector("select")).toBeNull();
  });

  test("with a name a hidden select carries the value", () => {
    const { container } = render(() => <Picker name="fruit" defaultSelectedKey="banana" />);

    const hidden = container.querySelector("select") as HTMLSelectElement;
    expect(hidden).not.toBeNull();
    expect(hidden.name).toBe("fruit");
    expect(hidden.value).toBe("banana");
    expect(hidden.getAttribute("tabindex")).toBe("-1");
    expect(hidden.closest("[aria-hidden=true]")).not.toBeNull();
  });

  test("the hidden select lists every option", () => {
    const { container } = render(() => <Picker name="fruit" />);

    const hidden = container.querySelector("select") as HTMLSelectElement;
    // One blank, then the four fruits.
    expect(hidden.options).toHaveLength(5);
    expect([...hidden.options].map((option) => option.value)).toEqual([
      "",
      "apple",
      "banana",
      "cherry",
      "date",
    ]);
  });

  test("a disabled select does not open", () => {
    render(() => <Picker isDisabled />);

    user.click(trigger());
    flush();

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("has no ARIA violations, open and closed", async () => {
    const { container } = render(() => <Picker name="fruit" />);
    expectNoAriaViolations(container);

    user.click(trigger());
    await tick();
    expectNoAriaViolations(container);
  });
});

describe("two selects side by side", () => {
  test("each button shows its OWN value", () => {
    render(() => (
      <>
        <Select
          label="Fruit"
          items={FRUITS}
          placeholder="Pick a fruit"
          defaultSelectedKey="apple"
          getTextValue={(fruit: Fruit) => fruit.name}
        >
          {(fruit: Fruit) => <Option>{fruit.name}</Option>}
        </Select>
        <Select
          label="Second fruit"
          items={FRUITS}
          placeholder="Pick another"
          defaultSelectedKey="banana"
          getTextValue={(fruit: Fruit) => fruit.name}
        >
          {(fruit: Fruit) => <Option>{fruit.name}</Option>}
        </Select>
      </>
    ));

    const [first, second] = screen.getAllByRole("button");
    expect(first?.textContent).toBe("Apple");
    expect(second?.textContent).toBe("Banana");
  });
});
