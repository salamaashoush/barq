import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { render, screen, tick, user } from "@barqjs/testing";

import { Select, SelectItem } from "./select.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

function rulesFor(className: string): string {
  const mentions = new RegExp(`\\.${className}(?![\\w-])`);
  return collectCss()
    .split("@layer barq.ui{")
    .filter((chunk) => mentions.test(chunk))
    .join("\n");
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
    const rules = trigger.className.split(" ").map(rulesFor).join("");
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
    expect(list.getAttribute("data-slot")).toBe("select-list");
    const rules = rulesFor(list.className.split(" ")[0] ?? "");
    expect(rules).toContain("background-color: var(--popover)");
    expect(rules).toContain("border-width: 1px");
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
    const rules = rulesFor(mark.className.split(" ")[0] ?? "");
    expect(rules).toContain("svg{display: none}");
    expect(rules).toContain("[data-selected] .");
  });
});
