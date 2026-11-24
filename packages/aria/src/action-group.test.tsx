import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { type Child, createSignal, flush } from "@barqjs/core";
import {
  accessibleDescription,
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  user,
  within,
} from "@barqjs/testing";
import { ActionGroup, ActionGroupItem } from "./action-group.tsx";
import type { Key, SelectionValue } from "./collections.ts";
import { provideLocale } from "./i18n.ts";
import { Toolbar } from "./toolbar.tsx";
import { Tooltip, TooltipTrigger, resetTooltipWarmup } from "./tooltip.tsx";

interface Action {
  id: string;
  name: string;
  "aria-label"?: string;
}

const two: Action[] = [
  { id: "1", name: "Click me 1" },
  { id: "2", name: "Click me 2" },
];

const three: Action[] = [
  { id: "0", name: "Click me 1" },
  { id: "1", name: "Click me 2" },
  { id: "2", name: "Click me 3" },
];

const four: Action[] = [
  { id: "one", name: "One" },
  { id: "two", name: "Two" },
  { id: "three", name: "Three" },
  { id: "four", name: "Four" },
];

interface LocaleProps {
  tag: string;
  children?: Child;
}

function Locale(props: LocaleProps) {
  const localeProps = provideLocale(() => props.tag);
  return <div {...localeProps}>{props.children}</div>;
}

type GroupProps = Omit<Parameters<typeof ActionGroup<Action>>[0], "children" | "items"> & {
  items?: Action[];
};

function Group(props: GroupProps) {
  return (
    <ActionGroup<Action> {...props} items={props.items ?? two}>
      {(action) => <ActionGroupItem>{action.name}</ActionGroupItem>}
    </ActionGroup>
  );
}

function tabIndices(elements: HTMLElement[]): (string | null)[] {
  return elements.map((element) => element.getAttribute("tabindex"));
}

function press(key: string): void {
  user.keyDown(key);
  flush();
}

function buttons(): HTMLElement[] {
  return screen.getAllByRole("button");
}

describe("ActionGroup", () => {
  test("is a toolbar of buttons by default", () => {
    render(() => <Group items={[{ id: "a", name: "Click me" }]} />);
    expect(screen.getByRole("toolbar")).toBeTruthy();
    expect(buttons()).toHaveLength(1);
    expect(screen.getByRole("toolbar").getAttribute("aria-orientation")).toBe("horizontal");
  });

  test("says when it is vertical", () => {
    render(() => <Group orientation="vertical" data-testid="test-group" />);
    expect(screen.getByTestId("test-group").getAttribute("aria-orientation")).toBe("vertical");
  });

  test("a disabled single-selection group is a disabled radiogroup", () => {
    render(() => <Group selectionMode="single" isDisabled />);
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("aria-disabled")).toBe("true");
    expect(group.hasAttribute("aria-orientation")).toBe(false);
  });

  const cases = [
    {
      name: "left/right, ltr, horizontal",
      tag: "de-DE",
      orientation: "horizontal",
      keys: ["ArrowRight", "ArrowLeft"],
      forward: true,
    },
    {
      name: "left/right, rtl, horizontal",
      tag: "ar-AE",
      orientation: "horizontal",
      keys: ["ArrowRight", "ArrowLeft"],
      forward: false,
    },
    {
      name: "up/down, ltr, horizontal",
      tag: "de-DE",
      orientation: "horizontal",
      keys: ["ArrowDown", "ArrowUp"],
      forward: true,
    },
    {
      name: "up/down, rtl, horizontal",
      tag: "ar-AE",
      orientation: "horizontal",
      keys: ["ArrowDown", "ArrowUp"],
      forward: true,
    },
    {
      name: "left/right, ltr, vertical",
      tag: "de-DE",
      orientation: "vertical",
      keys: ["ArrowRight", "ArrowLeft"],
      forward: true,
    },
    {
      name: "left/right, rtl, vertical",
      tag: "ar-AE",
      orientation: "vertical",
      keys: ["ArrowRight", "ArrowLeft"],
      forward: false,
    },
    {
      name: "up/down, ltr, vertical",
      tag: "de-DE",
      orientation: "vertical",
      keys: ["ArrowDown", "ArrowUp"],
      forward: true,
    },
    {
      name: "up/down, rtl, vertical",
      tag: "ar-AE",
      orientation: "vertical",
      keys: ["ArrowDown", "ArrowUp"],
      forward: true,
    },
  ] as const;

  for (const each of cases) {
    test(`the arrows move the one Tab stop (${each.name})`, () => {
      render(() => (
        <Locale tag={each.tag}>
          <Group items={three} orientation={each.orientation} />
        </Locale>
      ));
      const all = buttons();
      function at(index: number): string[] {
        return all.map((_, i) => (i === index ? "0" : "-1"));
      }
      let index = 0;
      function step(delta: number): number {
        return (index = (index + delta + 3) % 3);
      }

      user.tab();
      expect(tabIndices(all)).toEqual(at(0));

      press(each.keys[0]);
      expect(tabIndices(all)).toEqual(at(step(each.forward ? 1 : -1)));
      press(each.keys[1]);
      expect(tabIndices(all)).toEqual(at(step(each.forward ? -1 : 1)));
      press(each.keys[1]);
      expect(tabIndices(all)).toEqual(at(step(each.forward ? -1 : 1)));
      expect(document.activeElement).toBe(all[index] as HTMLElement);
    });
  }

  test("a held arrow key keeps moving", () => {
    render(() => <Group items={three} />);
    const all = buttons();
    user.tab();
    expect(document.activeElement).toBe(all[0] as HTMLElement);

    user.keyDown("ArrowRight");
    user.keyDown("ArrowRight", { repeat: true });
    flush();
    expect(document.activeElement).toBe(all[2] as HTMLElement);
  });

  const skipping = [
    {
      name: "middle disabled",
      tag: "de-DE",
      disabled: ["1"],
      steps: [
        [0, 1, 1],
        [2, 0, 2, 0],
      ],
    },
    { name: "first disabled", tag: "de-DE", disabled: ["0"], steps: [[1], [2, 1, 2, 1]] },
    { name: "last disabled", tag: "de-DE", disabled: ["2"], steps: [[0], [1, 0, 1, 0]] },
    { name: "first two disabled", tag: "de-DE", disabled: ["0", "1"], steps: [[2], [2, 2, 2, 2]] },
    { name: "rtl middle disabled", tag: "ar-AE", disabled: ["1"], steps: [[0], [2, 0, 2, 0]] },
    { name: "rtl first disabled", tag: "ar-AE", disabled: ["0"], steps: [[1], [2, 1, 2, 1]] },
  ] as const;

  for (const each of skipping) {
    test(`the arrows skip disabled items (${each.name})`, () => {
      render(() => (
        <Locale tag={each.tag}>
          <Group items={three} disabledKeys={each.disabled} />
        </Locale>
      ));
      const all = buttons();
      function stops(): HTMLElement[] {
        return all.filter((element) => element.getAttribute("tabindex") === "0");
      }

      user.tab();
      expect(document.activeElement).toBe(all[each.steps[0][0]] as HTMLElement);
      expect(stops()).toEqual([all[each.steps[0][0]] as HTMLElement]);

      // Right, Right, Left, Left: in rtl, Right goes back, so the walk is the
      // same either way round over three items with one or two disabled.
      const keys = ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowLeft"];
      for (const [i, key] of keys.entries()) {
        press(key);
        expect(document.activeElement).toBe(all[each.steps[1][i] as number] as HTMLElement);
        expect(stops()).toEqual([all[each.steps[1][i] as number] as HTMLElement]);
      }
    });
  }

  test("two disabled items in the middle are both skipped", () => {
    render(() => (
      <Group items={[...three, { id: "3", name: "Click me 4" }]} disabledKeys={["1", "2"]} />
    ));
    const all = buttons();
    user.tab();
    expect(document.activeElement).toBe(all[0] as HTMLElement);
    press("ArrowRight");
    expect(document.activeElement).toBe(all[3] as HTMLElement);
    press("ArrowRight");
    expect(document.activeElement).toBe(all[0] as HTMLElement);
    press("ArrowLeft");
    expect(document.activeElement).toBe(all[3] as HTMLElement);
  });

  function Between(props: GroupProps) {
    return (
      <>
        <button type="button" aria-label="ButtonBefore" />
        <Group {...props} />
        <button type="button" aria-label="ButtonAfter" />
      </>
    );
  }

  test("Tab enters at the first item and leaves after it", () => {
    render(() => <Between selectionMode="single" />);
    const before = screen.getByLabelText("ButtonBefore");
    const after = screen.getByLabelText("ButtonAfter");
    const radios = screen.getAllByRole("radio");

    user.focus(before);
    user.tab();
    expect(document.activeElement).toBe(radios[0] as HTMLElement);
    user.tab();
    expect(document.activeElement).toBe(after);
  });

  test("Shift+Tab enters at the last item and leaves before the first", () => {
    render(() => <Between selectionMode="single" />);
    const before = screen.getByLabelText("ButtonBefore");
    const after = screen.getByLabelText("ButtonAfter");
    const radios = screen.getAllByRole("radio");

    user.focus(after);
    user.tab({ shift: true });
    expect(document.activeElement).toBe(radios[1] as HTMLElement);
    user.tab({ shift: true });
    expect(document.activeElement).toBe(before);
  });

  test("Tab back into the group returns to the item last focused", () => {
    render(() => <Between selectionMode="single" />);
    const before = screen.getByLabelText("ButtonBefore");
    const after = screen.getByLabelText("ButtonAfter");
    const radios = screen.getAllByRole("radio");

    user.focus(before);
    user.tab();
    press("ArrowRight");
    expect(document.activeElement).toBe(radios[1] as HTMLElement);
    user.tab();
    expect(document.activeElement).toBe(after);
    user.tab({ shift: true });
    expect(document.activeElement).toBe(radios[1] as HTMLElement);
  });

  test("single selection: one radio is checked at a time", () => {
    render(() => <Group selectionMode="single" />);
    const [first, second] = screen.getAllByRole("radio") as [HTMLElement, HTMLElement];

    user.click(first);
    flush();
    expect(first.getAttribute("aria-checked")).toBe("true");
    expect(first.hasAttribute("data-selected")).toBe(true);

    user.click(second);
    flush();
    expect(first.getAttribute("aria-checked")).toBe("false");
    expect(second.getAttribute("aria-checked")).toBe("true");
  });

  test("multiple selection: a toolbar of checkboxes", () => {
    render(() => <Group selectionMode="multiple" />);
    expect(screen.getByRole("toolbar")).toBeTruthy();
    const [first, second] = screen.getAllByRole("checkbox") as [HTMLElement, HTMLElement];

    user.click(first);
    flush();
    user.click(second);
    flush();
    expect(first.getAttribute("aria-checked")).toBe("true");
    expect(second.getAttribute("aria-checked")).toBe("true");
  });

  test("Ctrl+A selects nothing more", () => {
    render(() => <Group selectionMode="multiple" />);
    const [first, second] = screen.getAllByRole("checkbox") as [HTMLElement, HTMLElement];

    user.click(first);
    flush();
    user.keyDown("a", { ctrlKey: true });
    user.keyDown("a", { metaKey: true });
    flush();
    expect(first.getAttribute("aria-checked")).toBe("true");
    expect(second.getAttribute("aria-checked")).toBe("false");
  });

  test("no selection: plain buttons, never checked", () => {
    render(() => <Group selectionMode="none" items={[{ id: "a", name: "Click me" }]} />);
    const only = screen.getByRole("button");
    user.click(only);
    flush();
    expect(only.hasAttribute("aria-checked")).toBe(false);
    expect(only.hasAttribute("data-selected")).toBe(false);
  });

  test("an item is a radio in the Tab order, and takes no stray attributes", () => {
    render(() => <Group selectionMode="single" items={[{ id: "a", name: "Click me" }]} />);
    const only = screen.getByRole("radio");
    expect(only.getAttribute("tabindex")).toBe("0");
    expect(only.hasAttribute("isdisabled")).toBe(false);
    expect(only.hasAttribute("selectionmode")).toBe(false);
  });

  test("a disabled key is disabled and cannot be selected", () => {
    const changes: SelectionValue[] = [];
    render(() => (
      <Group
        selectionMode="single"
        disabledKeys={["1"]}
        onSelectionChange={(keys) => changes.push(keys)}
      />
    ));
    const [first, second] = screen.getAllByRole("radio") as [HTMLElement, HTMLElement];

    user.click(first);
    flush();
    expect(first.hasAttribute("disabled")).toBe(true);
    expect(changes).toHaveLength(0);

    user.click(second);
    flush();
    expect(second.hasAttribute("disabled")).toBe(false);
    expect(changes).toHaveLength(1);
  });

  test("controlled selection reports and waits", () => {
    const changes: SelectionValue[] = [];
    render(() => (
      <Group
        selectionMode="single"
        selectedKeys={["1"]}
        onSelectionChange={(keys) => changes.push(keys)}
      />
    ));
    const [first, second] = screen.getAllByRole("radio") as [HTMLElement, HTMLElement];
    expect(first.getAttribute("aria-checked")).toBe("true");

    user.click(second);
    flush();
    expect(changes).toHaveLength(1);
    expect(first.getAttribute("aria-checked")).toBe("true");
    expect(second.getAttribute("aria-checked")).toBe("false");
  });

  test("uncontrolled selection starts from the default", () => {
    const changes: SelectionValue[] = [];
    render(() => (
      <Group
        selectionMode="single"
        defaultSelectedKeys={["1"]}
        onSelectionChange={(keys) => changes.push(keys)}
      />
    ));
    const [first, second] = screen.getAllByRole("radio") as [HTMLElement, HTMLElement];
    expect(first.getAttribute("aria-checked")).toBe("true");

    user.click(second);
    flush();
    expect(changes).toHaveLength(1);
    expect(first.getAttribute("aria-checked")).toBe("false");
    expect(second.getAttribute("aria-checked")).toBe("true");
  });

  test("pressing the selected item deselects it", () => {
    const changes: Set<Key>[] = [];
    render(() => (
      <Group selectionMode="single" onSelectionChange={(keys) => changes.push(new Set(keys))} />
    ));
    const [first] = screen.getAllByRole("radio") as [HTMLElement];

    user.click(first);
    flush();
    user.click(first);
    flush();
    expect(changes).toEqual([new Set(["1"]), new Set()]);
  });

  test("disallowEmptySelection keeps the last one selected", () => {
    render(() => (
      <Group selectionMode="single" disallowEmptySelection defaultSelectedKeys={["1"]} />
    ));
    const [first] = screen.getAllByRole("radio") as [HTMLElement];
    user.click(first);
    flush();
    expect(first.getAttribute("aria-checked")).toBe("true");
  });

  test("names and descriptions go on the group", () => {
    render(() => (
      <>
        <span id="described">Described</span>
        <span id="labelled">Labelled</span>
        <Group aria-label="Test" data-testid="a" />
        <Group aria-labelledby="labelled" aria-describedby="described" data-testid="b" />
      </>
    ));
    expect(accessibleName(screen.getByTestId("a"))).toBe("Test");
    expect(screen.getByTestId("b").getAttribute("aria-labelledby")).toBe("labelled");
    expect(accessibleDescription(screen.getByTestId("b"))).toBe("Described");
  });

  test("an item takes the aria-label its data gives", () => {
    render(() => (
      <Group selectionMode="single" items={[{ id: "a", name: "Click me", "aria-label": "Test" }]} />
    ));
    expect(screen.getByRole("radio").getAttribute("aria-label")).toBe("Test");
  });

  test("data attributes reach the group and the items", () => {
    render(() => (
      <ActionGroup items={two} data-testid="test">
        {(action) => (
          <ActionGroupItem data-testid={`item-${action.id}`}>{action.name}</ActionGroupItem>
        )}
      </ActionGroup>
    ));
    expect(screen.getByRole("toolbar").getAttribute("data-testid")).toBe("test");
    expect(buttons()[0]?.getAttribute("data-testid")).toBe("item-1");
  });

  test("onAction is called with the key and the value", () => {
    const calls: [Key, Action][] = [];
    render(() => (
      <Group
        items={[{ id: "test", name: "Click me" }]}
        onAction={(key, value) => calls.push([key, value])}
      />
    ));
    user.click(screen.getByRole("button"));
    flush();
    expect(calls).toEqual([["test", { id: "test", name: "Click me" }]]);
  });

  test("onAction is not called for a disabled group", () => {
    const calls: Key[] = [];
    render(() => (
      <Group
        items={[{ id: "test", name: "Click me" }]}
        isDisabled
        onAction={(key) => calls.push(key)}
      />
    ));
    user.click(screen.getByRole("button"));
    flush();
    expect(calls).toEqual([]);
  });

  test("onAction is not called for a disabled item", () => {
    const calls: Key[] = [];
    render(() => (
      <Group
        items={[{ id: "test", name: "Click me" }]}
        disabledKeys={["test"]}
        onAction={(key) => calls.push(key)}
      />
    ));
    user.click(screen.getByRole("button"));
    flush();
    expect(calls).toEqual([]);
  });

  test("a TooltipTrigger around an item describes its button", () => {
    resetTooltipWarmup();
    render(() => (
      <ActionGroup items={[{ id: "hi", name: "Hi" }]}>
        {(action) => (
          <TooltipTrigger delay={0}>
            <ActionGroupItem>{action.name}</ActionGroupItem>
            <Tooltip>I'm a tooltip</Tooltip>
          </TooltipTrigger>
        )}
      </ActionGroup>
    ));
    user.tab();
    flush();
    const tooltip = screen.getByRole("tooltip");
    expect(accessibleDescription(screen.getByRole("button"))).toBe(tooltip.textContent ?? "");
  });

  test("with every key disabled the group is disabled and Tab passes it by", () => {
    render(() => (
      <>
        <input type="text" aria-label="foo" />
        <Group
          selectionMode="single"
          items={[
            { id: "test1", name: "Hi" },
            { id: "test2", name: "Bye" },
          ]}
          disabledKeys={["test1", "test2"]}
        />
        <input type="text" aria-label="bar" />
      </>
    ));
    expect(screen.getByRole("radiogroup").getAttribute("aria-disabled")).toBe("true");
    const [foo, bar] = screen.getAllByRole("textbox") as [HTMLElement, HTMLElement];
    user.focus(foo);
    user.tab();
    expect(document.activeElement).toBe(bar);
    user.tab({ shift: true });
    expect(document.activeElement).toBe(foo);
  });

  test("disabled keys that match no item do not disable the group", () => {
    render(() => (
      <>
        <input type="text" aria-label="foo" />
        <Group
          selectionMode="single"
          items={[
            { id: "test1", name: "Hi" },
            { id: "test2", name: "Bye" },
          ]}
          disabledKeys={["test1", "foo"]}
        />
        <input type="text" aria-label="bar" />
      </>
    ));
    expect(screen.getByRole("radiogroup").hasAttribute("aria-disabled")).toBe(false);
    const [foo] = screen.getAllByRole("textbox") as [HTMLElement];
    const radios = screen.getAllByRole("radio");
    user.focus(foo);
    user.tab();
    expect(document.activeElement).toBe(radios[1] as HTMLElement);
    user.tab({ shift: true });
    expect(document.activeElement).toBe(foo);
  });

  test("unknown disabled keys beside every real one still disable the group", () => {
    render(() => (
      <Group
        selectionMode="single"
        items={[
          { id: "test1", name: "Hi" },
          { id: "test2", name: "Bye" },
        ]}
        disabledKeys={["test1", "test2", "foo"]}
      />
    ));
    expect(screen.getByRole("radiogroup").getAttribute("aria-disabled")).toBe("true");
  });

  test("a focused item that goes hands the Tab stop to its neighbour", () => {
    const [items, setItems] = createSignal(four);
    render(() => <Group items={items()} />);
    const all = buttons();
    user.focus(all[2] as HTMLElement);
    expect(tabIndices(all)).toEqual(["-1", "-1", "0", "-1"]);

    setItems(four.filter((action) => action.id !== "three"));
    flush();
    expect(tabIndices(buttons())).toEqual(["-1", "-1", "0"]);
    expect(buttons()[2]?.textContent).toBe("Four");
  });

  test("keys come from getKey when the items carry no id", () => {
    const calls: Key[] = [];
    render(() => (
      <ActionGroup
        items={[{ slug: "cut" }, { slug: "copy" }]}
        getKey={(item) => item.slug}
        onAction={(key) => calls.push(key)}
      >
        {(item) => <ActionGroupItem>{item.slug}</ActionGroupItem>}
      </ActionGroup>
    ));
    user.click(screen.getByRole("button", { name: "copy" }));
    flush();
    expect(calls).toEqual(["copy"]);
  });

  test("class and style go on the group, inside a wrapper of its own", () => {
    render(() => <Group class="row" style={{ gap: "4px" }} />);
    const group = screen.getByRole("toolbar");
    expect(group.getAttribute("class")).toBe("row");
    expect(group.style.gap).toBe("4px");
    expect(group.parentElement?.getAttribute("data-overflow-mode")).toBe("wrap");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Group aria-label="Actions" selectionMode="single" />);
    expectNoAriaViolations(container);
  });
});

describe("ActionGroup inside a Toolbar", () => {
  test("is a group, and leaves the toolbar's arrows to the toolbar", () => {
    render(() => (
      <>
        <button type="button">Before</button>
        <Toolbar aria-label="Actions">
          <ActionGroup
            aria-label="Align text"
            items={[
              { id: "left", name: "Align left" },
              { id: "center", name: "Align center" },
              { id: "right", name: "Align right" },
            ]}
          >
            {(action) => <ActionGroupItem>{action.name}</ActionGroupItem>}
          </ActionGroup>
          <ActionGroup
            aria-label="Zoom"
            items={[
              { id: "in", name: "Zoom in" },
              { id: "out", name: "Zoom out" },
            ]}
          >
            {(action) => <ActionGroupItem>{action.name}</ActionGroupItem>}
          </ActionGroup>
        </Toolbar>
      </>
    ));
    flush();
    function named(name: string): HTMLElement {
      return screen.getByRole("button", { name });
    }
    expect(screen.getAllByRole("group")).toHaveLength(2);

    user.focus(named("Before"));
    user.tab();
    expect(document.activeElement).toBe(named("Align left"));

    // Along the toolbar: the toolbar's, across the groups.
    press("ArrowRight");
    expect(document.activeElement).toBe(named("Align center"));
    // Across it: the group's, and it wraps.
    press("ArrowDown");
    expect(document.activeElement).toBe(named("Align right"));
    press("ArrowDown");
    expect(document.activeElement).toBe(named("Align left"));
    press("ArrowUp");
    expect(document.activeElement).toBe(named("Align right"));

    press("ArrowRight");
    expect(document.activeElement).toBe(named("Zoom in"));
    press("ArrowLeft");
    expect(document.activeElement).toBe(named("Align right"));
  });

  test("actions and selection both work inside it", () => {
    const actions: Key[] = [];
    const changes: SelectionValue[] = [];
    render(() => (
      <Toolbar aria-label="Actions">
        <ActionGroup
          items={[
            { id: "alignleft", name: "Align Left" },
            { id: "alignright", name: "Align Right" },
          ]}
          onAction={(key) => actions.push(key)}
        >
          {(action) => <ActionGroupItem>{action.name}</ActionGroupItem>}
        </ActionGroup>
        <ActionGroup
          selectionMode="single"
          items={[
            { id: "list", name: "List" },
            { id: "grid", name: "Grid" },
          ]}
          onSelectionChange={(keys) => changes.push(keys)}
        >
          {(action) => <ActionGroupItem>{action.name}</ActionGroupItem>}
        </ActionGroup>
      </Toolbar>
    ));
    flush();

    user.tab();
    expect(document.activeElement?.textContent).toBe("Align Left");
    user.keyboard("{Enter}");
    flush();
    expect(actions).toEqual(["alignleft"]);

    press("ArrowRight");
    press("ArrowRight");
    press("ArrowRight");
    expect(document.activeElement?.textContent).toBe("Grid");
    user.keyboard("{Enter}");
    flush();
    expect(actions).toEqual(["alignleft"]);
    expect(changes).toHaveLength(1);
  });
});

interface Identified {
  id: string;
}

describe('ActionGroup overflowMode="collapse"', () => {
  let widths = { button: 100, other: 250 };
  let restoreRect: (() => void) | null = null;

  beforeEach(() => {
    widths = { button: 100, other: 250 };
    // Element.prototype owns the method; a spy on HTMLElement.prototype leaves an
    // own property behind on restore that shadows later patches of Element's.
    const spy = spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const width = this instanceof HTMLButtonElement ? widths.button : widths.other;
      return {
        width,
        height: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    });
    restoreRect = () => spy.mockRestore();
  });

  afterEach(() => {
    restoreRect?.();
    restoreRect = null;
  });

  function Collapsing(props: GroupProps) {
    return <Group overflowMode="collapse" items={four} {...props} />;
  }

  test("moves what does not fit into a menu", () => {
    const calls: Key[] = [];
    render(() => <Collapsing onAction={(key) => calls.push(key)} />);
    flush();

    const group = screen.getByRole("toolbar");
    const shown = within(group).getAllByRole("button");
    expect(shown).toHaveLength(2);
    expect(shown[0]?.textContent).toBe("One");
    const more = shown[1] as HTMLElement;
    expect(more.getAttribute("aria-label")).toBe("More items");
    expect(more.hasAttribute("aria-haspopup")).toBe(true);
    expect(more.hasAttribute("aria-checked")).toBe(false);

    user.click(more);
    flush();
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Two", "Three", "Four"]);

    user.click(items[1] as HTMLElement);
    flush();
    expect(calls).toEqual(["three"]);
  });

  test("by priority, the lowest go into the menu and the rest keep their order", () => {
    widths = { button: 100, other: 350 };
    const priority: Record<string, number> = { one: 0, two: 0, three: 2, four: 1 };
    render(() => <Collapsing getPriority={(action: Identified) => priority[action.id] ?? 0} />);
    flush();
    const shown = within(screen.getByRole("toolbar")).getAllByRole("button");
    expect(shown.map((one) => one.textContent)).toEqual(["Three", "Four", "…"]);
    user.click(shown[2] as HTMLElement);
    flush();
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["One", "Two"]);
  });

  test("the menu button, the menu and an item in it take their own classes", () => {
    render(() => (
      <ActionGroup
        items={four}
        overflowMode="collapse"
        moreClass="more"
        menuClass="menu"
        menuItemClass="menu-item"
      >
        {(action) => <ActionGroupItem class="as-button">{action.name}</ActionGroupItem>}
      </ActionGroup>
    ));
    flush();
    const shown = within(screen.getByRole("toolbar")).getAllByRole("button");
    expect(shown[0]?.className).toBe("as-button");
    const more = shown[1] as HTMLElement;
    expect(more.className).toBe("more");
    expect(more.getAttribute("data-slot")).toBe("action-group-more");
    user.click(more);
    flush();
    const menu = screen.getByRole("menu");
    expect(menu.closest(".menu") ?? (menu.classList.contains("menu") ? menu : null)).not.toBeNull();
    const item = within(menu).getAllByRole("menuitem")[0] as HTMLElement;
    expect(item.className).toBe("menu-item");
    expect(item.getAttribute("data-slot")).toBe("action-group-menu-item");
  });

  test("in a named group only partly collapsed, the menu button is still More items", () => {
    render(() => <Collapsing aria-label="Text" />);
    flush();
    const shown = within(screen.getByRole("toolbar", { name: "Text" })).getAllByRole("button");
    expect(shown[1]?.getAttribute("aria-label")).toBe("More items");
  });

  test("the menu button takes a name of the caller's", () => {
    render(() => <Collapsing aria-label="Text" moreLabel="More actions" />);
    flush();
    const shown = within(screen.getByRole("toolbar", { name: "Text" })).getAllByRole("button");
    expect(shown[1]?.getAttribute("aria-label")).toBe("More actions");
  });

  test("an item's data attributes follow it into the menu", () => {
    render(() => (
      <ActionGroup items={four} overflowMode="collapse">
        {(action) => <ActionGroupItem data-element={action.id}>{action.name}</ActionGroupItem>}
      </ActionGroup>
    ));
    flush();
    user.click(within(screen.getByRole("toolbar")).getAllByRole("button")[1] as HTMLElement);
    flush();
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items[0]?.getAttribute("data-element")).toBe("two");
  });

  test("the menu button joins the roving Tab stop", () => {
    render(() => <Collapsing />);
    flush();
    const [first, more] = within(screen.getByRole("toolbar")).getAllByRole("button") as [
      HTMLElement,
      HTMLElement,
    ];
    expect(tabIndices([first, more])).toEqual(["0", "0"]);

    user.focus(first);
    expect(tabIndices([first, more])).toEqual(["0", "-1"]);

    press("ArrowRight");
    expect(document.activeElement).toBe(more);
    expect(tabIndices([first, more])).toEqual(["-1", "0"]);
  });

  test("with nothing left outside the menu, the name goes to the menu button", () => {
    widths = { button: 100, other: 150 };
    const calls: Key[] = [];
    render(() => <Collapsing aria-label="Test" onAction={(key) => calls.push(key)} />);
    flush();

    expect(screen.queryByRole("toolbar")).toBeNull();
    const only = screen.getByRole("button");
    expect(only.getAttribute("aria-label")).toBe("Test");
    expect(only.hasAttribute("aria-haspopup")).toBe(true);

    user.click(only);
    flush();
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["One", "Two", "Three", "Four"]);
    user.click(items[1] as HTMLElement);
    flush();
    expect(calls).toEqual(["two"]);
  });

  test("single selection collapses entirely into radio menu items", () => {
    const changes: Set<Key>[] = [];
    render(() => (
      <Collapsing
        selectionMode="single"
        defaultSelectedKeys={["two"]}
        onSelectionChange={(keys) => changes.push(new Set(keys))}
      />
    ));
    flush();
    expect(screen.queryByRole("radiogroup")).toBeNull();

    const more = screen.getByRole("button");
    expect(more.getAttribute("aria-label")).toBe("More items");
    expect(more.hasAttribute("aria-checked")).toBe(false);
    expect(more.hasAttribute("data-selected")).toBe(true);

    user.click(more);
    flush();
    let items = within(screen.getByRole("menu")).getAllByRole("menuitemradio");
    expect(items).toHaveLength(4);
    expect(items[1]?.getAttribute("aria-checked")).toBe("true");

    user.click(items[2] as HTMLElement);
    flush();
    expect(changes).toEqual([new Set(["three"])]);

    user.click(more);
    flush();
    items = within(screen.getByRole("menu")).getAllByRole("menuitemradio");
    expect(items[1]?.getAttribute("aria-checked")).toBe("false");
    expect(items[2]?.getAttribute("aria-checked")).toBe("true");
  });

  test("single selection that cannot be emptied shows the choice on the button", () => {
    render(() => (
      <Collapsing
        aria-label="View"
        selectionMode="single"
        disallowEmptySelection
        defaultSelectedKeys={["two"]}
      />
    ));
    flush();
    const more = screen.getByRole("button");
    expect(more.textContent).toBe("Two");
    expect(accessibleName(more)).toBe("View Two");
  });

  test("multiple selection collapses entirely into checkbox menu items", () => {
    const changes: Set<Key>[] = [];
    render(() => (
      <Collapsing
        selectionMode="multiple"
        defaultSelectedKeys={["two", "three"]}
        onSelectionChange={(keys) => changes.push(new Set(keys))}
      />
    ));
    flush();
    const more = screen.getByRole("button");
    expect(more.getAttribute("aria-label")).toBe("More items");

    user.click(more);
    flush();
    const items = within(screen.getByRole("menu")).getAllByRole("menuitemcheckbox");
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "true",
      "false",
    ]);

    user.click(items[3] as HTMLElement);
    flush();
    expect(changes).toEqual([new Set(["two", "three", "four"])]);
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "true",
      "true",
    ]);
  });

  test("a disabled group disables the menu button too", () => {
    render(() => <Collapsing isDisabled />);
    flush();
    const shown = within(screen.getByRole("toolbar")).getAllByRole("button");
    expect(shown).toHaveLength(2);
    expect(shown[0]?.hasAttribute("disabled")).toBe(true);
    expect(shown[1]?.getAttribute("aria-label")).toBe("More items");
    expect(shown[1]?.hasAttribute("disabled")).toBe(true);
  });

  test("disabled keys are disabled menu items", () => {
    const calls: Key[] = [];
    render(() => <Collapsing disabledKeys={["two", "four"]} onAction={(key) => calls.push(key)} />);
    flush();
    const group = screen.getByRole("toolbar");
    expect(within(group).getAllByRole("button")).toHaveLength(2);

    user.click(within(group).getByRole("button", { name: "More items" }));
    flush();
    const menu = screen.getByRole("menu");
    function item(name: string): HTMLElement {
      return within(menu).getByRole("menuitem", { name });
    }
    expect(item("Two").getAttribute("aria-disabled")).toBe("true");
    expect(item("Three").hasAttribute("aria-disabled")).toBe(false);
    expect(item("Four").getAttribute("aria-disabled")).toBe("true");

    user.click(item("Two"));
    user.click(item("Four"));
    flush();
    expect(calls).toEqual([]);
    user.click(item("Three"));
    flush();
    expect(calls).toEqual(["three"]);
  });

  test("the menu button's label is localised", () => {
    render(() => (
      <Locale tag="de-DE">
        <Collapsing />
      </Locale>
    ));
    flush();
    expect(
      within(screen.getByRole("toolbar")).getAllByRole("button")[1]?.getAttribute("aria-label"),
    ).toBe("Weitere Elemente");
  });

  test("a group that fits keeps every item", () => {
    widths = { button: 100, other: 1000 };
    render(() => <Collapsing />);
    flush();
    expect(within(screen.getByRole("toolbar")).getAllByRole("button")).toHaveLength(4);
  });

  test("a vertical group with selection never collapses", () => {
    render(() => <Collapsing orientation="vertical" selectionMode="single" />);
    flush();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  test("wrap mode never measures", () => {
    render(() => <Group items={four} />);
    flush();
    expect(within(screen.getByRole("toolbar")).getAllByRole("button")).toHaveLength(4);
  });
});
