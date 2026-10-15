import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import ItemDemo from "./item-demo.tsx";
import ItemDropdown from "./item-dropdown.tsx";
import ItemGroupExample from "./item-group.tsx";
import ItemLink from "./item-link.tsx";
import ItemRtl from "./item-rtl.tsx";
import ItemSeparatorExample from "./item-separator.tsx";
import ItemSize from "./item-size.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the item examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("item")).toEqual([]);
  });

  test("an item given href is the link itself", () => {
    render(() => <ItemDemo />);
    const link = screen.getByRole("link", { name: "Your profile has been verified." });
    expect(link.getAttribute("data-slot")).toBe("item");
    expect(link.getAttribute("data-size")).toBe("sm");
  });

  test("each size is written on its item", () => {
    render(() => <ItemSize />);
    const sizes = [...document.querySelectorAll('[data-slot="item"]')].map((item) =>
      item.getAttribute("data-size"),
    );
    expect(sizes).toEqual(["default", "sm", "xs"]);
  });

  test("a group is a list of its items", () => {
    render(() => <ItemGroupExample />);
    const list = screen.getByRole("list");
    expect(list.querySelectorAll('[data-slot="item"]')).toHaveLength(3);
    expect(
      screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Invite salama", "Invite jane", "Invite john"]);
  });

  test("the external link opens a new tab and wears the item's classes", () => {
    render(() => <ItemLink />);
    const external = screen.getByRole("link", { name: /External resource/ });
    expect(external.getAttribute("target")).toBe("_blank");
    expect(external.getAttribute("rel")).toBe("noopener noreferrer");
    expect(external.classList.contains("group/item")).toBe(true);
  });

  test("the dropdown lists one item per person and closes on a choice", async () => {
    render(() => <ItemDropdown />);
    const trigger = screen.getByRole("button", { name: "Select" });
    await user.click(trigger);
    await settle();

    const entries = screen.getAllByRole("menuitem");
    expect(entries).toHaveLength(3);
    expect(
      entries.map((entry) => entry.querySelector('[data-slot="item-title"]')?.textContent),
    ).toEqual(["salama", "jane", "john"]);

    await user.click(entries[1]!);
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("a separator sits between the two items of the group", () => {
    render(() => <ItemSeparatorExample />);
    const slots = [...screen.getByRole("list").children].map((child) =>
      child.getAttribute("data-slot"),
    );
    expect(slots).toEqual(["item", "item-separator", "item"]);
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <ItemRtl />);
    expect(document.querySelectorAll('[dir="rtl"] [data-slot="item"]')).toHaveLength(2);
  });
});
