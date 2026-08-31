import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { render, screen, tick, user } from "@barqjs/testing";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "./context-menu.tsx";

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

  test("its label is drawn in the body colour, which a dropdown's is not", () => {
    const { container } = render(() => <ContextMenuLabel>Section</ContextMenuLabel>);
    const label = container.querySelector('[data-slot="context-menu-label"]') as HTMLElement;

    expect(label.getAttribute("role")).toBe("presentation");
    expect(rulesFor(label.className.split(" ")[0] ?? "")).toContain("color: var(--foreground)");
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
