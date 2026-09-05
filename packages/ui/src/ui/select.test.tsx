import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Select, SelectGroup, SelectItem } from "./select.tsx";

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
