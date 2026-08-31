import { describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";
import { render, screen } from "@barqjs/testing";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  itemMediaVariants,
  ItemSeparator,
  ItemTitle,
  itemVariants,
} from "./item.tsx";

function rulesFor(className: string): string {
  const mentions = new RegExp(`\\.${className}(?![\\w-])`);
  return collectCss()
    .split("@layer barq.ui{")
    .filter((chunk) => mentions.test(chunk))
    .join("\n");
}

function slot(name: string): HTMLElement {
  const found = document.querySelector(`[data-slot="${name}"]`);
  if (found === null) throw new Error(`no [data-slot="${name}"]`);
  return found as HTMLElement;
}

describe("Item", () => {
  test("every part is reachable by its slot", () => {
    render(() => (
      <ItemGroup>
        <Item>
          <ItemHeader>Yesterday</ItemHeader>
          <ItemMedia variant="icon">i</ItemMedia>
          <ItemContent>
            <ItemTitle>Q3 report</ItemTitle>
            <ItemDescription>Uploaded two days ago.</ItemDescription>
          </ItemContent>
          <ItemActions>x</ItemActions>
          <ItemFooter>2 MB</ItemFooter>
        </Item>
      </ItemGroup>
    ));

    for (const name of [
      "item-group",
      "item",
      "item-header",
      "item-media",
      "item-content",
      "item-title",
      "item-description",
      "item-actions",
      "item-footer",
    ]) {
      expect(slot(name)).toBeTruthy();
    }
    expect(slot("item-description").tagName).toBe("P");
  });

  test("a group is a list and its items are countable", () => {
    render(() => (
      <ItemGroup>
        <Item>a</Item>
        <Item>b</Item>
      </ItemGroup>
    ));
    expect(screen.getByRole("list")).toBeTruthy();
  });

  test("the variant and the size are attributes as well as classes", () => {
    render(() => (
      <Item variant="outline" size="sm">
        a
      </Item>
    ));
    const item = slot("item");
    expect(item.getAttribute("data-variant")).toBe("outline");
    expect(item.getAttribute("data-size")).toBe("sm");
  });

  test("defaults are named rather than left blank", () => {
    render(() => <Item>a</Item>);
    expect(slot("item").getAttribute("data-variant")).toBe("default");
    expect(slot("item").getAttribute("data-size")).toBe("default");
  });

  test("an href makes it an anchor, and the hover tint is scoped to one", () => {
    render(() => <Item href="/reports/q3">Q3 report</Item>);
    const item = slot("item");
    expect(item.tagName).toBe("A");
    expect(item.getAttribute("href")).toBe("/reports/q3");

    const base = itemVariants().split(" ")[0] ?? "";
    // `[a&]:hover:bg-accent/50`: a div in a list must not light up under the
    // pointer when there is nothing to press.
    expect(rulesFor(base)).toContain("a.");
  });

  test("without an href it is a div", () => {
    render(() => <Item>a</Item>);
    expect(slot("item").tagName).toBe("DIV");
  });

  test("media lifts itself when the row has a description", () => {
    const base = itemMediaVariants().split(" ")[0] ?? "";
    expect(rulesFor(base)).toContain('[data-slot="item"]:has([data-slot="item-description"])');
  });

  test("the icon variant is a bordered square", () => {
    const icon = itemMediaVariants({ variant: "icon" }).split(" ").at(-1) ?? "";
    const rules = rulesFor(icon);
    expect(rules).toContain("background-color: var(--muted)");
    expect(rules).toContain("border-width: 1px");
  });

  test("a second content column does not grow", () => {
    render(() => (
      <Item>
        <ItemContent>a</ItemContent>
        <ItemContent>b</ItemContent>
      </Item>
    ));
    const className = slot("item-content").className.split(" ")[0] ?? "";
    expect(rulesFor(className)).toContain('+ [data-slot="item-content"]{flex: none}');
  });

  test("the separator answers to its own slot and is horizontal", () => {
    render(() => (
      <ItemGroup>
        <Item>a</Item>
        <ItemSeparator />
        <Item>b</Item>
      </ItemGroup>
    ));
    const separator = slot("item-separator");
    expect(separator.getAttribute("data-orientation")).toBe("horizontal");
    expect(document.querySelector('[data-slot="separator"]')).toBeNull();
  });
});
