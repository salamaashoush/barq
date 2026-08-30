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
import { ComboBox } from "./combobox.tsx";
import { Option } from "./listbox.tsx";

interface Fruit {
  id: string;
  name: string;
}

const FRUITS: Fruit[] = [
  { id: "apple", name: "Apple" },
  { id: "banana", name: "Banana" },
  { id: "blackberry", name: "Blackberry" },
  { id: "cherry", name: "Cherry" },
];

function Picker(
  props: Incoming<{
    defaultSelectedKey?: Key | null;
    allowsCustomValue?: boolean;
    menuTrigger?: "input" | "focus" | "manual";
    onSelectionChange?: (key: Key | null) => void;
    onInputChange?: (value: string) => void;
  }>,
) {
  return (
    <ComboBox
      label="Fruit"
      items={FRUITS}
      defaultSelectedKey={props.defaultSelectedKey?.()}
      allowsCustomValue={props.allowsCustomValue?.()}
      menuTrigger={props.menuTrigger?.()}
      onSelectionChange={props.onSelectionChange?.()}
      onInputChange={props.onInputChange?.()}
      getTextValue={(fruit: Fruit) => fruit.name}
    >
      {(fruit: Fruit) => <Option>{fruit.name}</Option>}
    </ComboBox>
  );
}

function input(): HTMLInputElement {
  return screen.getByRole("combobox") as HTMLInputElement;
}

/** Type into the field the way a browser does: the value first, then the event. */
function type(text: string): void {
  const element = input();
  element.value = text;
  user.keyDown(text.slice(-1) || "Backspace");
  element.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
}

describe("ComboBox", () => {
  test("is a named combobox with nothing open", () => {
    render(() => <Picker />);

    expect(accessibleName(input())).toBe("Fruit");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(input().getAttribute("aria-autocomplete")).toBe("list");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("typing opens the list and filters it", async () => {
    render(() => <Picker />);

    user.focus(input());
    type("b");
    await tick();

    const options = screen.getAllByRole("option");
    expect(options.map((option: Element) => option.textContent)).toEqual(["Banana", "Blackberry"]);
    expect(input().getAttribute("aria-expanded")).toBe("true");
  });

  test("the match ignores case and accents", async () => {
    render(() => <Picker />);

    user.focus(input());
    type("CHER");
    await tick();

    expect(screen.getAllByRole("option").map((option: Element) => option.textContent)).toEqual([
      "Cherry",
    ]);
  });

  test("the caret stays in the input while the arrows move the highlight", async () => {
    render(() => <Picker />);

    user.focus(input());
    type("b");
    await tick();

    user.keyDown("ArrowDown");
    flush();

    expect(document.activeElement).toBe(input());
    const highlighted = input().getAttribute("aria-activedescendant");
    expect(highlighted).not.toBeNull();
    expect(document.getElementById(highlighted as string)?.textContent).toBe("Banana");

    user.keyDown("ArrowDown");
    flush();
    expect(
      document.getElementById(input().getAttribute("aria-activedescendant") as string)?.textContent,
    ).toBe("Blackberry");
  });

  test("no option is ever focused", async () => {
    render(() => <Picker />);

    user.focus(input());
    type("b");
    await tick();
    user.keyDown("ArrowDown");
    flush();

    for (const option of screen.getAllByRole("option")) {
      expect(option.getAttribute("tabindex")).toBeNull();
    }
  });

  test("Enter takes the highlighted option and closes", async () => {
    const chosen: (Key | null)[] = [];
    render(() => <Picker onSelectionChange={(key) => chosen.push(key)} />);

    user.focus(input());
    type("b");
    await tick();
    user.keyDown("ArrowDown");
    flush();
    user.keyDown("Enter");
    flush();

    expect(chosen).toEqual(["banana"]);
    expect(input().value).toBe("Banana");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("clicking an option takes it", async () => {
    const chosen: (Key | null)[] = [];
    render(() => <Picker onSelectionChange={(key) => chosen.push(key)} />);

    user.focus(input());
    type("b");
    await tick();
    user.click(screen.getByRole("option", { name: "Blackberry" }));
    flush();

    expect(chosen).toEqual(["blackberry"]);
    expect(input().value).toBe("Blackberry");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("Escape puts the selected option's text back", async () => {
    render(() => <Picker defaultSelectedKey="cherry" />);

    expect(input().value).toBe("Cherry");

    user.focus(input());
    type("b");
    await tick();
    user.keyDown("Escape");
    flush();

    expect(input().value).toBe("Cherry");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("blurring commits, so the field never shows what it is not", async () => {
    render(() => <Picker defaultSelectedKey="cherry" />);

    user.focus(input());
    type("appl");
    await tick();

    user.blur(input());
    flush();

    expect(input().value).toBe("Cherry");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("allowsCustomValue keeps what was typed", async () => {
    const chosen: (Key | null)[] = [];
    render(() => (
      <Picker
        allowsCustomValue
        defaultSelectedKey="cherry"
        onSelectionChange={(key) => chosen.push(key)}
      />
    ));

    user.focus(input());
    type("kumquat");
    flush();
    user.blur(input());
    flush();

    expect(input().value).toBe("kumquat");
    expect(chosen).toEqual([null]);
  });

  test("clearing the field clears the value", async () => {
    const chosen: (Key | null)[] = [];
    render(() => (
      <Picker defaultSelectedKey="cherry" onSelectionChange={(key) => chosen.push(key)} />
    ));

    user.focus(input());
    type("");
    flush();

    expect(chosen).toEqual([null]);
  });

  test("ArrowDown opens the whole list, unfiltered", async () => {
    render(() => <Picker defaultSelectedKey="cherry" />);

    user.focus(input());
    user.keyDown("ArrowDown");
    await tick();

    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  test("the button opens and closes the list without taking focus", async () => {
    render(() => <Picker />);

    const toggle = screen.getByRole("button");
    expect(toggle.getAttribute("tabindex")).toBe("-1");

    user.click(toggle);
    await tick();

    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(document.activeElement).toBe(input());

    user.click(toggle);
    flush();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("menuTrigger=focus opens on focus", async () => {
    render(() => <Picker menuTrigger="focus" />);

    user.focus(input());
    await tick();

    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  test("a query matching nothing closes the list", async () => {
    render(() => <Picker />);

    user.focus(input());
    type("b");
    await tick();
    expect(screen.queryByRole("listbox")).not.toBeNull();

    type("bzzz");
    flush();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("the input reports what was typed", async () => {
    const typed: string[] = [];
    render(() => <Picker onInputChange={(value) => typed.push(value)} />);

    user.focus(input());
    type("ba");

    expect(typed).toEqual(["ba"]);
  });

  test("has no ARIA violations, closed and open", async () => {
    const { container } = render(() => <Picker />);
    expectNoAriaViolations(container);

    user.focus(input());
    type("b");
    await tick();
    expectNoAriaViolations(container);
  });
});
