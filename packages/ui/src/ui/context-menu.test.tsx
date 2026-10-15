import { describe, expect, test } from "bun:test";
import { createSignal, flush, type Incoming } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./context-menu.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const ACTIONS = [
  { id: "back", name: "Back" },
  { id: "reload", name: "Reload" },
  { id: "save", name: "Save as" },
];

function Fixture(props: Incoming<{ onAction?: (key: string) => void }>) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>Right-click here</ContextMenuTrigger>
      <ContextMenuContent
        items={ACTIONS}
        aria-label="Page"
        onAction={(key) => props.onAction?.()?.(String(key))}
      >
        {(action: (typeof ACTIONS)[number]) => <ContextMenuItem>{action.name}</ContextMenuItem>}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function region(): HTMLElement {
  return document.querySelector('[data-slot="context-menu-trigger"]') as HTMLElement;
}

describe("ContextMenu", () => {
  test("the trigger is a region, and nothing is open until it is right-clicked", () => {
    render(() => <Fixture />);
    expect(region().textContent).toBe("Right-click here");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("a right-click opens the menu at the pointer", async () => {
    render(() => <Fixture />);
    user.rightClick(region(), { clientX: 200, clientY: 150 });
    await settle();

    const menu = screen.getByRole("menu", { name: "Page" });
    expect(screen.getAllByRole("menuitem").map((node) => node.textContent)).toEqual([
      "Back",
      "Reload",
      "Save as",
    ]);
    // The popover is placed against the POINT, not against the region: the
    // region's own box would put the menu at its right edge.
    const panel = menu.parentElement as HTMLElement;
    expect(panel.style.left).toBe("202px");
    expect(panel.style.top).toBe("150px");
  });

  test("choosing one reports its key and closes", async () => {
    const chosen: string[] = [];
    render(() => <Fixture onAction={(key) => chosen.push(key)} />);
    user.rightClick(region(), { clientX: 10, clientY: 10 });
    await settle();

    await user.click(screen.getByRole("menuitem", { name: "Reload" }));
    await settle();

    expect(chosen).toEqual(["reload"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("the region says when its menu is open", async () => {
    render(() => <Fixture />);
    expect(region().hasAttribute("data-open")).toBe(false);

    user.rightClick(region(), { clientX: 10, clientY: 10 });
    await settle();

    expect(region().getAttribute("data-open")).toBe("");
  });

  // Upstream styled the two apart and no longer does: a context menu's label is
  // the same muted `text-xs` a dropdown's is, so this renders the dropdown's
  // element under the context menu's slot rather than a second class.
  test("its label is a dropdown's, under its own slot", () => {
    const { container } = render(() => <ContextMenuLabel>Section</ContextMenuLabel>);
    const label = container.querySelector('[data-slot="context-menu-label"]') as HTMLElement;

    expect(label.getAttribute("role")).toBe("presentation");
    expect(rulesFor(label.className)).toContain("color: var(--muted-foreground)");
  });

  test("a separator and a shortcut carry their own slots", () => {
    const { container } = render(() => (
      <>
        <ContextMenuSeparator />
        <ContextMenuShortcut>⌘R</ContextMenuShortcut>
      </>
    ));

    expect(container.querySelector('[data-slot="context-menu-separator"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="context-menu-shortcut"]')?.textContent).toBe("⌘R");
  });
});

/** The menu as shadcn's own demo writes it. */
describe("a ContextMenu written as children", () => {
  function Page(
    props: Incoming<{
      onReload?: () => void;
      onBookmarks?: (checked: boolean) => void;
      onPerson?: (value: string) => void;
    }>,
  ) {
    const [person, setPerson] = createSignal("salama");
    return (
      <ContextMenu>
        <ContextMenuTrigger>Right-click here</ContextMenuTrigger>
        <ContextMenuContent aria-label="Page">
          <ContextMenuGroup>
            <ContextMenuItem inset>
              Back
              <ContextMenuShortcut>⌘[</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem inset disabled>
              Forward
            </ContextMenuItem>
            <ContextMenuItem inset onSelect={() => props.onReload?.()?.()}>
              Reload
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger inset>More tools</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Save page</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem
            defaultChecked
            onCheckedChange={(checked) => props.onBookmarks?.()?.(checked)}
          >
            Show bookmarks
          </ContextMenuCheckboxItem>
          <ContextMenuSeparator />
          <ContextMenuRadioGroup
            value={person()}
            onValueChange={(value) => {
              setPerson(value);
              props.onPerson?.()?.(value);
            }}
          >
            <ContextMenuLabel inset>People</ContextMenuLabel>
            <ContextMenuRadioItem value="salama">Salama</ContextMenuRadioItem>
            <ContextMenuRadioItem value="acme">Acme Inc</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  async function open(): Promise<void> {
    user.rightClick(region(), { clientX: 40, clientY: 30 });
    await settle();
  }

  test("every part carries the context menu's own slot", async () => {
    render(() => <Page />);
    await open();

    for (const name of [
      "context-menu-content",
      "context-menu-group",
      "context-menu-item",
      "context-menu-shortcut",
      "context-menu-sub-trigger",
      "context-menu-separator",
      "context-menu-checkbox-item",
      "context-menu-item-indicator",
      "context-menu-radio-group",
      "context-menu-label",
      "context-menu-radio-item",
    ]) {
      expect(document.querySelector(`[data-slot="${name}"]`), name).not.toBeNull();
    }
    expect(document.querySelector('[data-slot^="dropdown-menu"]')).toBeNull();
    expectNoAriaViolations(document.body);
  });

  test("it opens at the pointer and says it is open in both vocabularies", async () => {
    render(() => <Page />);
    expect(region().getAttribute("data-state")).toBe("closed");
    await open();

    const menu = screen.getByRole("menu", { name: "Page" });
    expect(region().getAttribute("data-open")).toBe("");
    expect(region().getAttribute("data-state")).toBe("open");
    expect(menu.getAttribute("data-state")).toBe("open");
    expect(menu.getAttribute("data-side")).toBe("right");
    expect(menu.getAttribute("data-align")).toBe("start");
    expect((menu.parentElement as HTMLElement).style.top).toBe("30px");
  });

  test("the arrows walk the written items across the group and past the disabled one", async () => {
    render(() => <Page />);
    user.key("F10", { shiftKey: true, target: region() });
    await settle();

    const walked: string[] = [];
    for (let step = 0; step < 6; step++) {
      walked.push(document.activeElement?.textContent ?? "");
      await user.keyboard("{ArrowDown}");
    }
    expect(walked).toEqual([
      "Back⌘[",
      "Reload",
      "More tools",
      "Show bookmarks",
      "Salama",
      "Acme Inc",
    ]);
  });

  test("an item's onSelect runs and the menu closes", async () => {
    let reloaded = 0;
    render(() => <Page onReload={() => reloaded++} />);
    await open();

    await user.click(screen.getByRole("menuitem", { name: "Reload" }));
    await settle();
    expect(reloaded).toBe(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("a checkbox item starts as it was told and reports being turned over", async () => {
    const changes: boolean[] = [];
    render(() => <Page onBookmarks={(checked) => changes.push(checked)} />);
    await open();

    const bookmarks = screen.getByRole("menuitemcheckbox", { name: "Show bookmarks" });
    expect(bookmarks.getAttribute("aria-checked")).toBe("true");
    expect(bookmarks.getAttribute("data-state")).toBe("checked");
    await user.click(bookmarks);
    await settle();
    expect(changes).toEqual([false]);
  });

  test("the radio group is named by its label and holds the value", async () => {
    const people: string[] = [];
    render(() => <Page onPerson={(value) => people.push(value)} />);
    await open();

    const group = screen
      .getAllByRole("group")
      .find((each) => each.getAttribute("data-slot") === "context-menu-radio-group");
    expect(accessibleName(group as HTMLElement)).toBe("People");
    expect(screen.getByRole("menuitemradio", { name: "Salama" }).getAttribute("aria-checked")).toBe(
      "true",
    );

    await user.click(screen.getByRole("menuitemradio", { name: "Acme Inc" }));
    await settle();
    expect(people).toEqual(["acme"]);
  });

  test("a submenu opens beside its trigger", async () => {
    render(() => <Page />);
    await open();

    const more = screen.getByRole("menuitem", { name: "More tools" });
    more.focus();
    await user.keyboard("{ArrowRight}");
    await settle();

    const submenu = screen.getByRole("menu", { name: "More tools" });
    expect(submenu.getAttribute("data-slot")).toBe("context-menu-sub-content");
    expect(more.getAttribute("data-state")).toBe("open");
    expect(document.activeElement?.textContent).toBe("Save page");
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("data-variant")).toBe(
      "destructive",
    );
  });

  test("the indent and the shortcut are on the inline axis", async () => {
    render(() => <Page />);
    await open();

    const back = screen.getByRole("menuitem", { name: /Back/ });
    expect(back.getAttribute("data-inset")).toBe("");
    expect(rulesFor(back.className)).toContain("padding-inline-start");
    const tick_ = document.querySelector(
      '[data-slot="context-menu-item-indicator"]',
    ) as HTMLElement;
    expect(rulesFor(tick_.className)).toContain("inset-inline-end");
    expect(rulesFor(tick_.className)).not.toContain("right:");
  });

  test("a portal with a container sends the menu there", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    render(() => (
      <ContextMenu>
        <ContextMenuTrigger>Right-click here</ContextMenuTrigger>
        <ContextMenuPortal container={host}>
          <ContextMenuContent aria-label="Page">
            <ContextMenuItem>Back</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenu>
    ));
    await open();

    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    host.remove();
  });
});
