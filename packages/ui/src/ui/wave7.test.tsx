import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Button } from "./button.tsx";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card.tsx";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "./menubar.tsx";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group.tsx";

function slot(name: string): HTMLElement {
  const found = document.querySelector(`[data-slot="${name}"]`);
  if (found === null) throw new Error(`no [data-slot="${name}"]`);
  return found as HTMLElement;
}

/** The portal builds on a microtask after the marker connects. */
async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

describe("ToggleGroup", () => {
  function Fixture(props: { type?: "single" | "multiple"; spacing?: number }) {
    return (
      <ToggleGroup type={props.type} spacing={props.spacing} variant="outline">
        <ToggleGroupItem value="bold" aria-label="Bold">
          B
        </ToggleGroupItem>
        <ToggleGroupItem value="italic" aria-label="Italic">
          I
        </ToggleGroupItem>
      </ToggleGroup>
    );
  }

  test("it is a group of pressable buttons", () => {
    render(() => <Fixture />);
    expect(screen.getByRole("group")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("false");
  });

  test("single keeps one pressed", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Bold" }));
    await user.click(screen.getByRole("button", { name: "Italic" }));
    expect(screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Italic" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  test("multiple keeps as many as are pressed", async () => {
    render(() => <Fixture type="multiple" />);
    await user.click(screen.getByRole("button", { name: "Bold" }));
    await user.click(screen.getByRole("button", { name: "Italic" }));
    expect(screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Italic" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  test("the value it reports is what is pressed", async () => {
    const seen: string[][] = [];
    render(() => (
      <ToggleGroup type="multiple" onChange={(value) => seen.push(value)}>
        <ToggleGroupItem value="bold" aria-label="Bold">
          B
        </ToggleGroupItem>
        <ToggleGroupItem value="italic" aria-label="Italic">
          I
        </ToggleGroupItem>
      </ToggleGroup>
    ));
    await user.click(screen.getByRole("button", { name: "Bold" }));
    await user.click(screen.getByRole("button", { name: "Italic" }));
    expect(seen.at(-1)).toEqual(["bold", "italic"]);
  });

  test("spacing 0 welds the items and only the ends are round", () => {
    render(() => <Fixture spacing={0} />);
    expect(slot("toggle-group").getAttribute("data-spacing")).toBe("0");
    const item = slot("toggle-group-item");
    expect(item.getAttribute("data-spacing")).toBe("0");
    const rules = rulesFor(item.className);
    expect(rules).toContain('[data-spacing="0"]:first-child{border-top-left-radius');
    expect(rules).toContain('[data-spacing="0"][data-variant="outline"]{border-left-style');
  });

  test("an item takes the group's variant, not its own default", () => {
    render(() => <Fixture />);
    expect(slot("toggle-group-item").getAttribute("data-variant")).toBe("outline");
  });
});

describe("HoverCard", () => {
  function Fixture() {
    return (
      <HoverCard openDelay={10} closeDelay={10}>
        <HoverCardTrigger>
          <Button>@barq</Button>
        </HoverCardTrigger>
        <HoverCardContent>Reactive without a virtual DOM.</HoverCardContent>
      </HoverCard>
    );
  }

  /** Long enough for a timer scheduled at `ms` to have run. */
  function after(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms + 15));
  }

  test("nothing is rendered until the pointer rests on the trigger", async () => {
    render(() => <Fixture />);
    expect(document.querySelector('[data-slot="hover-card-content"]')).toBeNull();

    await user.hover(screen.getByRole("button"));
    await after(10);
    await settle();
    expect(slot("hover-card-content").textContent).toBe("Reactive without a virtual DOM.");
  });

  test("it closes once the pointer leaves", async () => {
    render(() => <Fixture />);
    await user.hover(screen.getByRole("button"));
    await after(10);
    await settle();
    expect(document.querySelector('[data-slot="hover-card-content"]')).not.toBeNull();

    await user.unhover(screen.getByRole("button"));
    await after(10);
    await settle();
    expect(document.querySelector('[data-slot="hover-card-content"]')).toBeNull();
  });

  test("the pointer travelling into the card does not close it", async () => {
    // The whole difference between this and a tooltip. The card's own hover
    // handlers go on as named attributes: a component prop is an accessor, and
    // spreading the props object made `fromProps` call each handler once with
    // no event instead of binding it.
    render(() => <Fixture />);
    await user.hover(screen.getByRole("button"));
    await after(10);
    await settle();

    const card = slot("hover-card-content");
    await user.unhover(screen.getByRole("button"));
    await user.hover(card);
    await after(10);
    await settle();
    expect(document.querySelector('[data-slot="hover-card-content"]')).not.toBeNull();
  });

  test("it does not describe its trigger, which is what a tooltip does", async () => {
    render(() => <Fixture />);
    await user.hover(screen.getByRole("button"));
    await after(10);
    await settle();
    expect(screen.getByRole("button").hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("Menubar", () => {
  const FILE = [
    { id: "new", name: "New" },
    { id: "open", name: "Open" },
  ];

  function Fixture() {
    return (
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent items={FILE} aria-label="File">
            {(entry: (typeof FILE)[number]) => <MenubarItem>{entry.name}</MenubarItem>}
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent items={FILE} aria-label="Edit">
            {(entry: (typeof FILE)[number]) => <MenubarItem>{entry.name}</MenubarItem>}
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    );
  }

  test("it is a menubar of triggers", () => {
    render(() => <Fixture />);
    expect(screen.getByRole("menubar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "File" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  test("a trigger opens its own menu", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "File" }));
    await settle();
    expect(screen.getByRole("menu", { name: "File" })).toBeTruthy();
    expect(slot("menubar-content")).toBeTruthy();
  });

  test("the arrows move between the menus, which is what makes it a menubar", async () => {
    render(() => <Fixture />);
    const file = screen.getByRole("button", { name: "File" });
    file.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit" }));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(file);
  });

  test("the items are the dropdown's, under the menubar's own names", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "File" }));
    await settle();
    expect(slot("menubar-item")).toBeTruthy();
    expect(document.querySelector('[data-slot="dropdown-menu-item"]')).toBeNull();
  });
});
