import { describe, expect, test } from "bun:test";
import { createSignal, flush, type Incoming } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const FRUITS = [
  { id: "apple", name: "Apple" },
  { id: "banana", name: "Banana" },
  { id: "cherry", name: "Cherry" },
];

function Fixture(props: Incoming<{ onChange?: (key: string) => void; name?: string }>) {
  return (
    <Select
      items={FRUITS}
      aria-label="Fruit"
      placeholder="Pick one"
      name={props.name?.()}
      onSelectionChange={(key) => props.onChange?.()?.(String(key))}
    >
      {(fruit: (typeof FRUITS)[number]) => <SelectItem>{fruit.name}</SelectItem>}
    </Select>
  );
}

describe("Select", () => {
  test("the trigger shows the placeholder and says it is one", () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: /Pick one/ });
    expect(trigger.getAttribute("data-slot")).toBe("select-trigger");
    expect(trigger.getAttribute("data-placeholder")).toBe("");
    expect(trigger.getAttribute("data-size")).toBe("default");
  });

  test("the chevron is drawn by the trigger, not rendered into it", () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: /Pick one/ });
    expect(trigger.querySelector("svg")).toBeNull();
    const rules = rulesFor(trigger.className);
    expect(rules).toContain("::after");
    expect(rules).toContain("mask-image");
  });

  test("opening it lists the options", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: /Pick one/ }));
    await settle();

    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getAllByRole("option").map((node) => node.textContent)).toEqual([
      "Apple",
      "Banana",
      "Cherry",
    ]);
  });

  test("choosing one reports its key, closes, and shows the value", async () => {
    const chosen: string[] = [];
    render(() => <Fixture onChange={(key) => chosen.push(key)} />);
    await user.click(screen.getByRole("button", { name: /Pick one/ }));
    await settle();

    await user.click(screen.getByRole("option", { name: "Banana" }));
    await settle();

    expect(chosen).toEqual(["banana"]);
    expect(screen.queryByRole("listbox")).toBeNull();
    const trigger = screen.getByRole("button");
    expect(trigger.textContent).toBe("Banana");
    expect(trigger.hasAttribute("data-placeholder")).toBe(false);
  });

  test("the list is the styled box, and it is inside the popover", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: /Pick one/ }));
    await settle();

    const list = screen.getByRole("listbox");
    // `select-content`, which is what shadcn calls this element: a style's
    // `cn-select-content` reaches it by that name and by no other.
    expect(list.getAttribute("data-slot")).toBe("select-content");
    const rules = rulesFor(list.className);
    expect(rules).toContain("background-color: var(--popover)");
    // A ring rather than a border, which is what upstream draws now: it costs
    // no layout, so the list measures the same as the trigger it came from.
    expect(rules).toContain("--ui-ring-color: var(--foreground)");
  });

  test("a name renders a real <select>, so the value reaches a form post", () => {
    render(() => <Fixture name="fruit" />);
    const control = document.querySelector('select[name="fruit"]') as HTMLSelectElement;
    expect(control).not.toBeNull();
    expect([...control.options].map((option) => option.value)).toEqual([
      "",
      "apple",
      "banana",
      "cherry",
    ]);
  });

  test("the tick is CSS on data-selected", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: /Pick one/ }));
    await settle();
    const mark = document.querySelector('[data-slot="select-item-indicator"]')!;
    const rules = rulesFor(mark.className);
    expect(rules).toContain("svg{display: none}");
    expect(rules).toContain("[data-selected] .");
  });

  test("a group is a heading and a run of options built by the same callback", async () => {
    // Passing the callback to each group by hand is how the two come to
    // disagree about what an option looks like.
    const GROUPS = [
      { id: "fruit", name: "Fruit", options: [{ id: "apple", name: "Apple" }] },
      { id: "veg", name: "Veg", options: [{ id: "leek", name: "Leek" }] },
    ];
    render(() => (
      <Select
        items={GROUPS}
        aria-label="Produce"
        placeholder="Pick one"
        getChildren={(group: { options?: unknown[] }) =>
          group.options as { id: string; name: string; options?: unknown[] }[] | undefined
        }
      >
        {(value: { id: string; name: string; options?: unknown[] }) =>
          value.options === undefined ? (
            <SelectItem>{value.name}</SelectItem>
          ) : (
            <SelectGroup title={value.name} />
          )
        }
      </Select>
    ));
    await user.click(screen.getByRole("button", { name: /Pick one/ }));
    await settle();

    expect(screen.getAllByRole("option").map((each) => each.textContent)).toEqual([
      "Apple",
      "Leek",
    ]);
    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(2);
    const named = groups[0]?.getAttribute("aria-labelledby");
    expect(document.getElementById(named ?? "")?.textContent).toBe("Fruit");
    // The heading is a `select-label`, which is the slot a style names.
    const heading = document.querySelector('[data-slot="select-label"]');
    expect(heading).not.toBeNull();
    // Styled like a `<SelectLabel>`, because it IS one: a heading at the
    // list's own font size reads as an option.
    expect(rulesFor(heading?.className ?? "")).toContain("font-size: var(--text-xs)");
    expect(document.querySelector('[data-slot="select-group"]')).not.toBeNull();
  });
});

describe("a Select built from data carries shadcn's state attributes too", () => {
  test("open and closed on the trigger and the content, checked and highlighted on an item", async () => {
    render(() => (
      <Select items={FRUITS} aria-label="Fruit" defaultSelectedKey="banana">
        {(fruit: (typeof FRUITS)[number]) => <SelectItem>{fruit.name}</SelectItem>}
      </Select>
    ));
    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("data-state")).toBe("closed");

    await user.click(trigger);
    await settle();
    expect(trigger.getAttribute("data-state")).toBe("open");

    const list = screen.getByRole("listbox");
    expect(list.getAttribute("data-state")).toBe("open");
    expect(list.getAttribute("data-side")).toBe("bottom");
    expect(list.getAttribute("data-align")).toBe("start");

    const banana = screen.getByRole("option", { name: "Banana" });
    expect(banana.getAttribute("data-state")).toBe("checked");
    expect(banana.hasAttribute("data-highlighted")).toBe(true);
    expect(banana.hasAttribute("data-selected")).toBe(true);
    expect(screen.getByRole("option", { name: "Apple" }).getAttribute("data-state")).toBe(
      "unchecked",
    );
  });

  test("shadcn's names for the value and for disabled work with items as well", async () => {
    const chosen: string[] = [];
    render(() => (
      <Select
        items={FRUITS}
        aria-label="Fruit"
        defaultValue="apple"
        onValueChange={(value) => chosen.push(value)}
      >
        {(fruit: (typeof FRUITS)[number]) => <SelectItem>{fruit.name}</SelectItem>}
      </Select>
    ));
    const trigger = screen.getByRole("button");
    expect(trigger.textContent).toBe("Apple");

    await user.click(trigger);
    await settle();
    await user.click(screen.getByRole("option", { name: "Cherry" }));
    await settle();
    expect(chosen).toEqual(["cherry"]);
  });
});

/**
 * shadcn's own shape: a root, a trigger holding the value, and a content whose
 * items are written out.
 */
describe("a Select written as parts", () => {
  /** Focus goes back on a frame, once the list has left. */
  async function restored(): Promise<void> {
    await settle();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  function Written(
    props: Incoming<{
      value?: string;
      defaultValue?: string;
      onValueChange?: (value: string) => void;
      open?: boolean;
      onOpenChange?: (isOpen: boolean) => void;
      name?: string;
      disabled?: boolean;
      required?: boolean;
      size?: "sm" | "default";
      position?: "item-aligned" | "popper";
      side?: "top" | "right" | "bottom" | "left";
      align?: "start" | "center" | "end";
      sideOffset?: number;
      alignOffset?: number;
      placement?: "top start";
      offset?: number;
      "aria-label"?: string;
    }>,
  ) {
    return (
      <>
        <label for="fruit">Fruit</label>
        <Select
          value={props.value?.()}
          defaultValue={props.defaultValue?.()}
          onValueChange={props.onValueChange?.()}
          open={props.open?.()}
          onOpenChange={props.onOpenChange?.()}
          name={props.name?.()}
          disabled={props.disabled?.()}
          required={props.required?.()}
        >
          <SelectTrigger id="fruit" size={props.size?.()} aria-label={props["aria-label"]?.()}>
            <SelectValue placeholder="Select a fruit" />
          </SelectTrigger>
          <SelectContent
            position={props.position?.()}
            side={props.side?.()}
            align={props.align?.()}
            sideOffset={props.sideOffset?.()}
            alignOffset={props.alignOffset?.()}
            placement={props.placement?.()}
            offset={props.offset?.()}
          >
            <SelectGroup>
              <SelectLabel>Fruits</SelectLabel>
              <SelectItem value="apple">Apple</SelectItem>
              <SelectItem value="banana">
                <i data-icon="" />
                Banana
              </SelectItem>
              <SelectItem value="blueberry" disabled>
                Blueberry
              </SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Vegetables</SelectLabel>
              <SelectItem value="leek" textValue="Leek">
                Leek
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </>
    );
  }

  const trigger = (): HTMLElement => screen.getByRole("combobox");
  const slot = (name: string): HTMLElement | null =>
    document.querySelector<HTMLElement>(`[data-slot="${name}"]`);

  async function open(): Promise<void> {
    user.click(trigger());
    await settle();
  }

  test("the trigger is a combobox named by its label, carrying shadcn's slot and state", async () => {
    render(() => <Written />);
    await settle();

    const control = screen.getByRole("combobox", { name: "Fruit" });
    expect(control.getAttribute("data-slot")).toBe("select-trigger");
    expect(control.getAttribute("data-size")).toBe("default");
    expect(control.getAttribute("data-state")).toBe("closed");
    expect(control.getAttribute("aria-haspopup")).toBe("listbox");
    expect(control.getAttribute("aria-expanded")).toBe("false");
    expect(control.hasAttribute("data-placeholder")).toBe(true);
  });

  test("the value is its own slot, and shows the placeholder until something is chosen", async () => {
    render(() => <Written />);
    await settle();

    const value = slot("select-value");
    expect(trigger().contains(value)).toBe(true);
    expect(value?.textContent).toBe("Select a fruit");
    expect(value?.hasAttribute("data-placeholder")).toBe(true);
  });

  test("the chevron is an icon inside the trigger that a screen reader skips", async () => {
    render(() => <Written />);
    await settle();

    const chevron = trigger().querySelector('[data-slot="select-icon"]');
    expect(chevron?.tagName.toLowerCase()).toBe("svg");
    expect(chevron?.getAttribute("aria-hidden")).toBe("true");
  });

  test("size is an attribute the trigger's own rules read", async () => {
    render(() => <Written size="sm" />);
    await settle();

    expect(trigger().getAttribute("data-size")).toBe("sm");
    expect(rulesFor(trigger().className)).toContain('[data-size="sm"]');
  });

  test("a closed select has nothing of its list in the document", async () => {
    render(() => <Written defaultValue="apple" />);
    await settle();

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(slot("select-content")).toBeNull();
    expect(slot("select-item")).toBeNull();
  });

  test("the chosen value shows before the list has ever opened", async () => {
    render(() => <Written defaultValue="leek" />);
    await settle();

    expect(slot("select-value")?.textContent).toBe("Leek");
    expect(trigger().hasAttribute("data-placeholder")).toBe(false);
  });

  test("what the trigger shows is the item as it is drawn, icon included", async () => {
    render(() => <Written defaultValue="banana" />);
    await settle();

    expect(slot("select-value")?.textContent).toBe("Banana");
    expect(slot("select-value")?.querySelector("[data-icon]")).not.toBeNull();
  });

  test("opening it renders the content, the viewport and the items under their slots", async () => {
    render(() => <Written />);
    await settle();
    await open();

    const content = slot("select-content");
    expect(content).not.toBeNull();
    expect(content?.getAttribute("data-state")).toBe("open");
    expect(content?.getAttribute("data-side")).toBe("bottom");
    expect(content?.getAttribute("data-align")).toBe("center");

    const list = screen.getByRole("listbox");
    expect(list.getAttribute("data-slot")).toBe("select-viewport");
    expect(content?.contains(list)).toBe(true);
    expect(trigger().getAttribute("aria-controls")).toBe(list.id);
    expect(trigger().getAttribute("data-state")).toBe("open");

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Apple",
      "Banana",
      "Blueberry",
      "Leek",
    ]);
    for (const option of options) expect(option.getAttribute("data-slot")).toBe("select-item");
  });

  test("a group is named by the label written inside it", async () => {
    render(() => <Written />);
    await settle();
    await open();

    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(2);
    expect(
      groups.map(
        (group) =>
          document.getElementById(group.getAttribute("aria-labelledby") ?? "")?.textContent,
      ),
    ).toEqual(["Fruits", "Vegetables"]);
    expect(document.querySelectorAll('[data-slot="select-group"]')).toHaveLength(2);
    // One label a group, and no second one standing in for a title it lacks.
    expect(document.querySelectorAll('[data-slot="select-label"]')).toHaveLength(2);
    expect(slot("select-separator")?.getAttribute("role")).toBe("separator");
  });

  test("an item says whether it is checked, highlighted and disabled", async () => {
    render(() => <Written defaultValue="banana" />);
    await settle();
    await open();

    const banana = screen.getByRole("option", { name: "Banana" });
    expect(banana.getAttribute("data-state")).toBe("checked");
    expect(banana.getAttribute("aria-selected")).toBe("true");
    expect(banana.hasAttribute("data-highlighted")).toBe(true);
    expect(document.activeElement).toBe(banana);

    const apple = screen.getByRole("option", { name: "Apple" });
    expect(apple.getAttribute("data-state")).toBe("unchecked");
    expect(apple.hasAttribute("data-highlighted")).toBe(false);

    const blueberry = screen.getByRole("option", { name: "Blueberry" });
    expect(blueberry.getAttribute("aria-disabled")).toBe("true");
    expect(blueberry.hasAttribute("data-disabled")).toBe(true);

    user.keyDown("ArrowUp");
    flush();
    expect(apple.hasAttribute("data-highlighted")).toBe(true);
    expect(banana.hasAttribute("data-highlighted")).toBe(false);
  });

  test("choosing one reports its value as a string, closes, and shows it", async () => {
    const chosen: string[] = [];
    render(() => <Written onValueChange={(value) => chosen.push(value)} />);
    await settle();
    await open();

    user.click(screen.getByRole("option", { name: "Leek" }));
    await restored();

    expect(chosen).toEqual(["leek"]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(slot("select-value")?.textContent).toBe("Leek");
    expect(document.activeElement).toBe(trigger());
  });

  test("a disabled item cannot be chosen", async () => {
    const chosen: string[] = [];
    render(() => <Written onValueChange={(value) => chosen.push(value)} />);
    await settle();
    await open();

    user.click(screen.getByRole("option", { name: "Blueberry" }));
    await settle();
    expect(chosen).toEqual([]);
    expect(screen.queryByRole("listbox")).not.toBeNull();
  });

  test("a controlled value and a controlled open follow their props", async () => {
    const [value, setValue] = createSignal("apple");
    const [isOpen, setOpen] = createSignal(false);
    const asked: boolean[] = [];
    render(() => (
      <Written value={value()} open={isOpen()} onOpenChange={(next) => asked.push(next)} />
    ));
    await settle();
    expect(slot("select-value")?.textContent).toBe("Apple");

    user.click(trigger());
    await settle();
    expect(asked).toEqual([true]);
    expect(screen.queryByRole("listbox")).toBeNull();

    setOpen(true);
    setValue("leek");
    await settle();
    expect(screen.queryByRole("listbox")).not.toBeNull();
    expect(slot("select-value")?.textContent).toBe("Leek");
  });

  test("the keyboard opens it, walks it, and Escape gives focus back", async () => {
    render(() => <Written />);
    await settle();

    user.focus(trigger());
    user.keyDown("ArrowDown");
    await settle();
    expect(document.activeElement?.textContent).toBe("Apple");

    user.keyDown("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Banana");
    // Blueberry is disabled, so Down goes past it into the next group.
    user.keyDown("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Leek");
    user.keyDown("Home");
    expect(document.activeElement?.textContent).toBe("Apple");
    user.keyDown("End");
    expect(document.activeElement?.textContent).toBe("Leek");
    user.keyDown("b");
    expect(document.activeElement?.textContent).toBe("Banana");

    user.keyDown("Escape");
    await restored();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  test("Tab stays in the open list", async () => {
    render(() => <Written />);
    await settle();
    await open();

    await user.tab();
    await settle();
    expect(screen.getByRole("listbox").contains(document.activeElement)).toBe(true);
  });

  test("typing on the closed trigger changes the value", async () => {
    const chosen: string[] = [];
    render(() => <Written onValueChange={(value) => chosen.push(value)} />);
    await settle();

    user.focus(trigger());
    user.keyDown("l");
    await settle();
    expect(chosen).toEqual(["leek"]);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("the list is item-aligned unless told otherwise, and says which", async () => {
    render(() => <Written />);
    await settle();
    await open();

    expect(slot("select-content")?.getAttribute("data-position")).toBe("item-aligned");
    expect(slot("select-content")?.getAttribute("data-align-trigger")).toBe("true");
    expect(slot("select-viewport")?.getAttribute("data-position")).toBe("item-aligned");
    // Nothing scales a list that is measured as it is drawn.
    expect(rulesFor(slot("select-content")?.className ?? "")).toContain(
      '[data-align-trigger="true"]{animation: none}',
    );
  });

  test("side and align place a popper list, and the content reports both", async () => {
    render(() => <Written position="popper" side="top" align="end" />);
    await settle();
    await open();

    const content = slot("select-content");
    expect(content?.getAttribute("data-position")).toBe("popper");
    expect(content?.getAttribute("data-align-trigger")).toBe("false");
    expect(content?.getAttribute("data-side")).toBe("top");
    expect(content?.getAttribute("data-align")).toBe("end");
  });

  test("sideOffset is added to the gap the list keeps from its trigger", async () => {
    render(() => <Written position="popper" sideOffset={10} />);
    await settle();
    await open();

    // happy-dom measures the trigger at nothing, so its bottom edge is 0.
    expect(slot("select-content")?.parentElement?.style.top).toBe("14px");
  });

  test("alignOffset moves it along the trigger's edge", async () => {
    render(() => <Written position="popper" align="start" alignOffset={30} />);
    await settle();
    await open();

    expect(slot("select-content")?.parentElement?.style.left).toBe("30px");
  });

  test("placement and offset are still accepted, and win", async () => {
    render(() => (
      <Written position="popper" side="bottom" placement="top start" sideOffset={10} offset={20} />
    ));
    await settle();
    await open();

    const content = slot("select-content");
    expect(content?.getAttribute("data-side")).toBe("top");
    expect(content?.getAttribute("data-align")).toBe("start");
    expect(content?.parentElement?.style.top).toBe("-20px");
  });

  test("a disabled select is a disabled control that does not open", async () => {
    render(() => <Written disabled />);
    await settle();

    expect(trigger().hasAttribute("disabled")).toBe(true);
    expect(trigger().hasAttribute("data-disabled")).toBe(true);
    user.click(trigger());
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("a name renders a real <select> holding every item, so the value reaches a form post", async () => {
    const { container } = render(() => (
      <form>
        <Written name="fruit" defaultValue="banana" required />
      </form>
    ));
    await settle();

    const control = container.querySelector('select[name="fruit"]') as HTMLSelectElement;
    expect([...control.options].map((option) => option.value)).toEqual([
      "",
      "apple",
      "banana",
      "blueberry",
      "leek",
    ]);
    expect(control.required).toBe(true);
    expect(trigger().getAttribute("aria-required")).toBe("true");
    expect(new FormData(container.querySelector("form") as HTMLFormElement).get("fruit")).toBe(
      "banana",
    );
  });

  describe("the scroll buttons", () => {
    function overflow(list: HTMLElement, scrollTop: number): void {
      Object.defineProperty(list, "scrollHeight", { configurable: true, value: 400 });
      Object.defineProperty(list, "clientHeight", { configurable: true, value: 100 });
      list.scrollTop = scrollTop;
      list.dispatchEvent(new Event("scroll"));
      flush();
    }

    test("are not rendered while there is nothing to scroll to", async () => {
      render(() => <Written />);
      await settle();
      await open();

      expect(slot("select-scroll-up-button")).toBeNull();
      expect(slot("select-scroll-down-button")).toBeNull();
    });

    test("each appears at its own end of the content, outside the listbox", async () => {
      render(() => <Written />);
      await settle();
      await open();
      const list = screen.getByRole("listbox");
      overflow(list, 150);

      const up = slot("select-scroll-up-button");
      const down = slot("select-scroll-down-button");
      const content = slot("select-content");
      expect(content?.firstElementChild).toBe(up);
      expect(content?.lastElementChild).toBe(down);
      expect(list.contains(up)).toBe(false);
      expect(up?.getAttribute("aria-hidden")).toBe("true");
      expect(down?.getAttribute("aria-hidden")).toBe("true");
      expect(up?.querySelector("svg")).not.toBeNull();
      expect(rulesFor(up?.className ?? "")).toContain("cursor: default");

      overflow(list, 0);
      expect(slot("select-scroll-up-button")).toBeNull();
      expect(slot("select-scroll-down-button")).not.toBeNull();
    });

    test("the viewport hides its own scrollbar, since the arrows say the same thing", async () => {
      render(() => <Written />);
      await settle();
      await open();
      expect(rulesFor(screen.getByRole("listbox").className)).toContain("scrollbar-width: none");
    });

    test("can be written on their own, outside the content's defaults", () => {
      expect(typeof SelectScrollUpButton).toBe("function");
      expect(typeof SelectScrollDownButton).toBe("function");
    });
  });

  test("the rules name inline edges, so a right-to-left page mirrors them", async () => {
    render(() => <Written defaultValue="apple" />);
    await settle();
    await open();

    const itemRules = rulesFor(screen.getByRole("option", { name: "Apple" }).className);
    expect(itemRules).toContain("padding-inline-end:");
    expect(itemRules).not.toContain("padding-right:");
    expect(itemRules).not.toContain("padding-left:");
    const tick_ = rulesFor(slot("select-item-indicator")?.className ?? "");
    expect(tick_).toContain("inset-inline-end:");
    expect(tick_).not.toContain("right:");
    const triggerRules = rulesFor(trigger().className);
    expect(triggerRules).toContain("padding-inline-start:");
    expect(triggerRules).not.toContain("padding-left:");
  });

  test("has no ARIA violations, closed and open", async () => {
    // Named by `aria-label` here: the checker reads a `<label for>` only for
    // the native form controls, and this control is a `<button>`.
    const { container } = render(() => <Written aria-label="Fruit" name="fruit" />);
    await settle();
    expectNoAriaViolations(container);

    await open();
    expectNoAriaViolations(document.body);
  });
});
