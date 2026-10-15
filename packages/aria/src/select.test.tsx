import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, flush, type Incoming } from "@barqjs/core";
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
import {
  itemAlignedPosition,
  Select,
  SelectContent,
  SelectItemText,
  SelectRoot,
  SelectScrollButton,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from "./select.tsx";

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

describe("a select built from data says its state in both vocabularies", () => {
  test("on the trigger and on the list", async () => {
    render(() => <Picker />);
    expect(trigger().getAttribute("data-state")).toBe("closed");

    user.click(trigger());
    await tick();
    flush();

    expect(trigger().getAttribute("data-state")).toBe("open");
    expect(trigger().hasAttribute("data-open")).toBe(true);
    const list = screen.getByRole("listbox");
    expect(list.getAttribute("data-state")).toBe("open");
    expect(list.getAttribute("data-side")).toBe("bottom");
    expect(list.getAttribute("data-align")).toBe("start");
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

/**
 * The same select written as parts: a root, a trigger, and a content whose
 * options are its children.
 */
describe("a select written as parts", () => {
  async function settle(): Promise<void> {
    flush();
    await tick();
    flush();
  }

  /** Focus goes back on a frame, once the list has left. */
  async function restored(): Promise<void> {
    await settle();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  function Parts(
    props: Incoming<{
      selectedKey?: Key | null;
      defaultSelectedKey?: Key | null;
      name?: string;
      isDisabled?: boolean;
      isRequired?: boolean;
      dir?: "ltr" | "rtl";
      position?: "item-aligned" | "popper";
      "aria-label"?: string;
      onSelectionChange?: (key: Key | null) => void;
      onOpenChange?: (isOpen: boolean) => void;
    }>,
  ) {
    return (
      <>
        <label for="fruit">Fruit</label>
        <SelectRoot
          selectedKey={props.selectedKey?.()}
          defaultSelectedKey={props.defaultSelectedKey?.()}
          name={props.name?.()}
          isDisabled={props.isDisabled?.()}
          isRequired={props.isRequired?.()}
          dir={props.dir?.()}
          onSelectionChange={props.onSelectionChange?.()}
          onOpenChange={props.onOpenChange?.()}
        >
          <SelectTrigger id="fruit" aria-label={props["aria-label"]?.()}>
            <SelectValue placeholder="Pick one" />
          </SelectTrigger>
          <SelectContent position={props.position?.()} data-testid="content">
            <SelectScrollButton direction="up" data-testid="up" />
            <SelectViewport>
              <Option value="apple">
                <SelectItemText>Apple</SelectItemText>
              </Option>
              <Option value="banana">
                <SelectItemText>
                  <i data-icon="" />
                  Banana
                </SelectItemText>
              </Option>
              <Option value="cherry" isDisabled>
                <SelectItemText>Cherry</SelectItemText>
              </Option>
              <Option value="date">
                <SelectItemText>Date</SelectItemText>
              </Option>
            </SelectViewport>
            <SelectScrollButton direction="down" data-testid="down" />
          </SelectContent>
        </SelectRoot>
      </>
    );
  }

  function combobox(): HTMLElement {
    return screen.getByRole("combobox");
  }

  test("the trigger is a combobox that says it opens a listbox, named by its label", async () => {
    render(() => <Parts />);
    await settle();

    const control = combobox();
    expect(control.tagName).toBe("BUTTON");
    expect(control.getAttribute("aria-haspopup")).toBe("listbox");
    expect(control.getAttribute("aria-expanded")).toBe("false");
    expect(control.hasAttribute("aria-controls")).toBe(false);
    expect(control.getAttribute("data-state")).toBe("closed");
    expect(screen.getByRole("combobox", { name: "Fruit" })).toBe(control);
    expect(control.textContent).toBe("Pick one");
    expect(control.hasAttribute("data-placeholder")).toBe(true);
  });

  test("a closed list puts nothing in the document", async () => {
    render(() => <Parts />);
    await settle();

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  test("the value shows before the list has ever opened", async () => {
    render(() => <Parts defaultSelectedKey="date" />);
    await settle();

    expect(combobox().textContent).toBe("Date");
    expect(combobox().hasAttribute("data-placeholder")).toBe(false);
  });

  test("the value is the chosen option as it is drawn, not only its text", async () => {
    render(() => <Parts defaultSelectedKey="banana" />);
    await settle();

    expect(combobox().textContent).toBe("Banana");
    expect(combobox().querySelector("[data-icon]")).not.toBeNull();
  });

  test("a press opens the listbox, which the trigger then controls", async () => {
    const changes: boolean[] = [];
    render(() => <Parts onOpenChange={(isOpen) => changes.push(isOpen)} />);
    await settle();

    user.click(combobox());
    await settle();

    const list = screen.getByRole("listbox");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Apple",
      "Banana",
      "Cherry",
      "Date",
    ]);
    expect(combobox().getAttribute("aria-expanded")).toBe("true");
    expect(combobox().getAttribute("aria-controls")).toBe(list.id);
    expect(combobox().getAttribute("data-state")).toBe("open");
    expect(changes).toEqual([true]);
  });

  test("the open content says its state and side, and the listbox is inside it", async () => {
    render(() => <Parts />);
    await settle();
    user.click(combobox());
    await settle();

    const content = screen.getByTestId("content");
    expect(content.getAttribute("data-state")).toBe("open");
    expect(content.getAttribute("data-side")).toBe("bottom");
    expect(content.getAttribute("data-align")).toBe("start");
    expect(content.getAttribute("data-position")).toBe("popper");
    expect(content.contains(screen.getByRole("listbox"))).toBe(true);
    expect(content.getAttribute("role")).toBe("presentation");
  });

  test("choosing an option sets the value, closes, and returns focus to the trigger", async () => {
    const chosen: (Key | null)[] = [];
    render(() => <Parts onSelectionChange={(key) => chosen.push(key)} />);
    await settle();

    user.click(combobox());
    await settle();
    user.click(screen.getByRole("option", { name: "Banana" }));
    await restored();

    expect(chosen).toEqual(["banana"]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(combobox().textContent).toBe("Banana");
    expect(document.activeElement).toBe(combobox());
  });

  test("it reopens on the chosen option, which is the selected one", async () => {
    render(() => <Parts defaultSelectedKey="date" />);
    await settle();

    user.click(combobox());
    await settle();

    expect(screen.getByRole("option", { name: "Date" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Date");
  });

  test("Enter, Space and the vertical arrows each open it", async () => {
    for (const key of ["Enter", " ", "ArrowDown", "ArrowUp"]) {
      const view = render(() => <Parts />);
      await settle();

      user.focus(combobox());
      user.keyDown(key);
      await settle();
      expect(screen.queryByRole("listbox"), `after ${key}`).not.toBeNull();
      view.unmount();
    }
  });

  test("ArrowDown lands on the first option and ArrowUp on the last", async () => {
    const first = render(() => <Parts />);
    await settle();
    user.focus(combobox());
    user.keyDown("ArrowDown");
    await settle();
    expect(document.activeElement?.textContent).toBe("Apple");
    first.unmount();

    render(() => <Parts />);
    await settle();
    user.focus(combobox());
    user.keyDown("ArrowUp");
    await settle();
    expect(document.activeElement?.textContent).toBe("Date");
  });

  test("the arrows, Home and End move through the open list and skip a disabled option", async () => {
    render(() => <Parts />);
    await settle();
    user.focus(combobox());
    user.keyDown("ArrowDown");
    await settle();

    user.keyDown("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Banana");
    user.keyDown("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Date");
    user.keyDown("Home");
    expect(document.activeElement?.textContent).toBe("Apple");
    user.keyDown("End");
    expect(document.activeElement?.textContent).toBe("Date");
    expect(screen.getByRole("option", { name: "Cherry" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  test("typing in the open list jumps to a match", async () => {
    render(() => <Parts />);
    await settle();
    user.click(combobox());
    await settle();

    user.keyDown("d");
    expect(document.activeElement?.textContent).toBe("Date");
  });

  test("typing on the closed trigger changes the value without opening", async () => {
    const chosen: (Key | null)[] = [];
    render(() => <Parts onSelectionChange={(key) => chosen.push(key)} />);
    await settle();

    user.focus(combobox());
    user.keyDown("d");
    await settle();

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(combobox().textContent).toBe("Date");
    expect(chosen).toEqual(["date"]);
  });

  test("Enter on an option chooses it", async () => {
    const chosen: (Key | null)[] = [];
    render(() => <Parts onSelectionChange={(key) => chosen.push(key)} />);
    await settle();
    user.focus(combobox());
    user.keyDown("ArrowDown");
    await settle();

    user.keyDown("ArrowDown");
    user.key("Enter");
    await settle();

    expect(chosen).toEqual(["banana"]);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("Escape closes without choosing and returns focus to the trigger", async () => {
    const chosen: (Key | null)[] = [];
    render(() => <Parts onSelectionChange={(key) => chosen.push(key)} />);
    await settle();

    user.click(combobox());
    await settle();
    user.keyDown("Escape");
    await restored();

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(chosen).toEqual([]);
    expect(document.activeElement).toBe(combobox());
  });

  test("Tab does not leave the open list", async () => {
    render(() => <Parts />);
    await settle();
    user.click(combobox());
    await settle();

    await user.tab();
    await settle();
    expect(screen.getByRole("listbox").contains(document.activeElement)).toBe(true);
  });

  test("a controlled value follows the prop and reports what was asked for", async () => {
    const chosen: (Key | null)[] = [];
    const [value, setValue] = createSignal<Key | null>("apple");
    render(() => <Parts selectedKey={value()} onSelectionChange={(key) => chosen.push(key)} />);
    await settle();
    expect(combobox().textContent).toBe("Apple");

    user.click(combobox());
    await settle();
    user.click(screen.getByRole("option", { name: "Date" }));
    await settle();
    expect(chosen).toEqual(["date"]);
    expect(combobox().textContent).toBe("Apple");

    setValue("date");
    await settle();
    expect(combobox().textContent).toBe("Date");
  });

  test("a disabled select does not open and says so", async () => {
    render(() => <Parts isDisabled />);
    await settle();

    expect(combobox().hasAttribute("disabled")).toBe(true);
    expect(combobox().hasAttribute("data-disabled")).toBe(true);
    user.click(combobox());
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("a required select says so on the trigger and on the hidden control", async () => {
    const { container } = render(() => <Parts name="fruit" isRequired />);
    await settle();

    expect(combobox().getAttribute("aria-required")).toBe("true");
    expect(container.querySelector("select")?.required).toBe(true);
  });

  test("the reading direction is written on the trigger and the content", async () => {
    render(() => <Parts dir="rtl" />);
    await settle();
    expect(combobox().getAttribute("dir")).toBe("rtl");

    user.click(combobox());
    await settle();
    expect(screen.getByTestId("content").getAttribute("dir")).toBe("rtl");
  });

  test("without a name or a form there is no hidden control", async () => {
    const { container } = render(() => <Parts />);
    await settle();
    expect(container.querySelector("select")).toBeNull();
  });

  test("with a name a hidden select lists the options and carries the value", async () => {
    const { container } = render(() => <Parts name="fruit" defaultSelectedKey="banana" />);
    await settle();

    const hidden = container.querySelector("select") as HTMLSelectElement;
    expect(hidden.name).toBe("fruit");
    expect([...hidden.options].map((option) => option.value)).toEqual([
      "",
      "apple",
      "banana",
      "cherry",
      "date",
    ]);
    expect(hidden.value).toBe("banana");
    expect(hidden.getAttribute("tabindex")).toBe("-1");
    expect(hidden.closest("[aria-hidden=true]")).not.toBeNull();
  });

  test("inside a form the hidden control is there without a name", async () => {
    const { container } = render(() => (
      <form>
        <Parts isRequired />
      </form>
    ));
    await settle();
    expect(container.querySelector("select")?.required).toBe(true);
  });

  test("a required select with nothing chosen fails the form's check, on the trigger", async () => {
    const { container } = render(() => (
      <form>
        <Parts name="fruit" isRequired />
      </form>
    ));
    await settle();
    expect(combobox().hasAttribute("aria-invalid")).toBe(false);

    const form = container.querySelector("form") as HTMLFormElement;
    expect(form.checkValidity()).toBe(false);
    await settle();

    // The control that failed is clipped out of sight, so the trigger is what
    // says so.
    expect(combobox().getAttribute("aria-invalid")).toBe("true");
    expect(combobox().hasAttribute("data-invalid")).toBe(true);
  });

  test("the value reaches a form post, and follows a choice", async () => {
    const { container } = render(() => (
      <form>
        <Parts name="fruit" defaultSelectedKey="apple" />
      </form>
    ));
    await settle();
    const form = container.querySelector("form") as HTMLFormElement;
    expect(new FormData(form).get("fruit")).toBe("apple");

    user.click(combobox());
    await settle();
    user.click(screen.getByRole("option", { name: "Date" }));
    await settle();
    expect(new FormData(form).get("fruit")).toBe("date");
  });

  test("has no ARIA violations, open and closed", async () => {
    // Named by `aria-label` here: the checker reads a `<label for>` only for
    // the native form controls, and this control is a `<button>`.
    const { container } = render(() => <Parts name="fruit" aria-label="Fruit" />);
    await settle();
    expectNoAriaViolations(container);

    user.click(combobox());
    await settle();
    expectNoAriaViolations(document.body);
  });

  describe("an item-aligned list", () => {
    const measure = Element.prototype.getBoundingClientRect;

    /** happy-dom lays nothing out, so every box the placement reads is stated. */
    function layOut(boxes: (element: Element) => [number, number, number, number] | null): void {
      Element.prototype.getBoundingClientRect = function stated(this: Element): DOMRect {
        const [top, left, width, height] = boxes(this) ?? [0, 0, 0, 0];
        return {
          top,
          left,
          width,
          height,
          right: left + width,
          bottom: top + height,
          x: left,
          y: top,
          toJSON: () => ({}),
        };
      };
    }

    afterEach(() => {
      Element.prototype.getBoundingClientRect = measure;
    });

    function boxesWithTriggerAt(
      top: number,
    ): (element: Element) => [number, number, number, number] | null {
      return (element) => {
        if (element.getAttribute("role") === "combobox") return [top, 100, 200, 36];
        if (element.getAttribute("data-testid") === "content") return [0, 0, 220, 200];
        if (element.getAttribute("role") === "option" && element.textContent === "Date") {
          return [68, 4, 212, 32];
        }
        return null;
      };
    }

    test("lies over the trigger with the chosen option on top of it", async () => {
      layOut(boxesWithTriggerAt(300));
      render(() => <Parts position="item-aligned" defaultSelectedKey="date" />);
      await settle();
      user.click(combobox());
      await settle();

      const content = screen.getByTestId("content");
      expect(content.getAttribute("data-align-trigger")).toBe("true");
      // The trigger's centre is at 318 and the option's is 84 into the list.
      expect(content.parentElement?.style.top).toBe("234px");
      expect(content.parentElement?.style.left).toBe("96px");
    });

    test("hangs off the trigger instead where it would leave the viewport", async () => {
      layOut(boxesWithTriggerAt(40));
      render(() => <Parts position="item-aligned" defaultSelectedKey="date" />);
      await settle();
      user.click(combobox());
      await settle();

      // Under the trigger's bottom edge at 76, by the popover's own 8.
      expect(screen.getByTestId("content").parentElement?.style.top).toBe("84px");
    });

    test("a popper list is not measured against its option at all", async () => {
      layOut(boxesWithTriggerAt(300));
      render(() => <Parts defaultSelectedKey="date" />);
      await settle();
      user.click(combobox());
      await settle();

      const content = screen.getByTestId("content");
      expect(content.getAttribute("data-align-trigger")).toBe("false");
      expect(content.parentElement?.style.top).toBe("344px");
    });
  });

  describe("the scroll buttons", () => {
    function overflow(list: HTMLElement, scrollTop: number): void {
      Object.defineProperty(list, "scrollHeight", { configurable: true, value: 400 });
      Object.defineProperty(list, "clientHeight", { configurable: true, value: 100 });
      list.scrollTop = scrollTop;
      list.dispatchEvent(new Event("scroll"));
      flush();
    }

    test("are absent while the list does not overflow", async () => {
      render(() => <Parts />);
      await settle();
      user.click(combobox());
      await settle();

      expect(screen.queryByTestId("up")).toBeNull();
      expect(screen.queryByTestId("down")).toBeNull();
    });

    test("each is there only while the list can scroll its way", async () => {
      render(() => <Parts />);
      await settle();
      user.click(combobox());
      await settle();
      const list = screen.getByRole("listbox");

      overflow(list, 0);
      expect(screen.queryByTestId("up")).toBeNull();
      expect(screen.queryByTestId("down")).not.toBeNull();

      overflow(list, 150);
      expect(screen.queryByTestId("up")).not.toBeNull();
      expect(screen.queryByTestId("down")).not.toBeNull();

      overflow(list, 300);
      expect(screen.queryByTestId("up")).not.toBeNull();
      expect(screen.queryByTestId("down")).toBeNull();
    });

    test("are hidden from assistive technology and outside the listbox", async () => {
      render(() => <Parts />);
      await settle();
      user.click(combobox());
      await settle();
      const list = screen.getByRole("listbox");
      overflow(list, 150);

      const up = screen.getByTestId("up");
      expect(up.getAttribute("aria-hidden")).toBe("true");
      expect(list.contains(up)).toBe(false);
    });

    test("holding the pointer over one scrolls the list until it leaves", async () => {
      render(() => <Parts />);
      await settle();
      user.click(combobox());
      await settle();
      const list = screen.getByRole("listbox");
      overflow(list, 0);

      const down = screen.getByTestId("down");
      down.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 130));
      const reached = list.scrollTop;
      expect(reached).toBeGreaterThan(0);

      down.dispatchEvent(new Event("pointerleave"));
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(list.scrollTop).toBe(reached);
    });
  });
});

describe("itemAlignedPosition", () => {
  const boundary = { width: 1000, height: 800 };
  const anchor = { top: 300, left: 100, width: 200, height: 36 };

  test("centres the chosen option on the trigger", () => {
    // The option sits 68px down a list that is currently drawn somewhere else
    // entirely, and it is 32 tall against a 36 trigger.
    const placed = itemAlignedPosition({
      trigger: anchor,
      value: null,
      content: { top: 500, left: 400, width: 220, height: 200 },
      item: { top: 568, left: 404, width: 212, height: 32 },
      itemText: null,
      boundary,
    });
    // The list's top goes to 300 + 18 - (68 + 16) = 234, which is 102 above the
    // trigger's bottom edge at 336.
    expect(placed?.offset).toBe(-102);
  });

  test("starts the option's text where the value's text starts", () => {
    const placed = itemAlignedPosition({
      trigger: anchor,
      value: { top: 308, left: 112, width: 60, height: 20 },
      content: { top: 500, left: 400, width: 220, height: 200 },
      item: { top: 568, left: 404, width: 212, height: 32 },
      itemText: { top: 574, left: 412, width: 60, height: 20 },
      boundary,
    });
    // The text is 12px into the list and the value 12px into the trigger, so
    // the two left edges coincide.
    expect(placed?.crossOffset).toBe(0);
  });

  test("lines up the far edges in a right-to-left page", () => {
    const placed = itemAlignedPosition({
      trigger: anchor,
      value: { top: 308, left: 228, width: 60, height: 20 },
      content: { top: 500, left: 400, width: 220, height: 200 },
      item: { top: 568, left: 404, width: 212, height: 32 },
      itemText: { top: 574, left: 548, width: 60, height: 20 },
      boundary,
      direction: "rtl",
    });
    // The text ends 12px short of the list's right edge and the value 12px
    // short of the trigger's, so the two right edges coincide.
    expect(placed?.crossOffset).toBe(0);
  });

  test("gives up when the list would leave the top of the viewport", () => {
    expect(
      itemAlignedPosition({
        trigger: { ...anchor, top: 40 },
        value: null,
        content: { top: 500, left: 400, width: 220, height: 200 },
        item: { top: 668, left: 404, width: 212, height: 32 },
        itemText: null,
        boundary,
      }),
    ).toBeNull();
  });

  test("gives up when it would leave the bottom", () => {
    expect(
      itemAlignedPosition({
        trigger: { ...anchor, top: 700 },
        value: null,
        content: { top: 500, left: 400, width: 220, height: 200 },
        item: { top: 504, left: 404, width: 212, height: 32 },
        itemText: null,
        boundary,
      }),
    ).toBeNull();
  });
});
