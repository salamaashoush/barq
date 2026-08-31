import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Button } from "./button.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const ACTIONS = [
  { id: "rename", name: "Rename" },
  { id: "duplicate", name: "Duplicate" },
  { id: "delete", name: "Delete" },
];

describe("DropdownMenu", () => {
  function Fixture(props: Incoming<{ onAction?: (key: string) => void }>) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="outline">Actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          items={ACTIONS}
          aria-label="Actions"
          onAction={(key) => props.onAction?.()?.(String(key))}
        >
          {(action: (typeof ACTIONS)[number]) => (
            <DropdownMenuItem variant={action.id === "delete" ? "destructive" : "default"}>
              {action.name}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  test("the trigger is the button, and it says what it opens", () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("pressing it opens a menu of the items", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await settle();

    expect(screen.getByRole("menu", { name: "Actions" })).toBeTruthy();
    expect(screen.getAllByRole("menuitem").map((node) => node.textContent)).toEqual([
      "Rename",
      "Duplicate",
      "Delete",
    ]);
  });

  test("choosing one reports its key and closes", async () => {
    const chosen: string[] = [];
    render(() => <Fixture onAction={(key) => chosen.push(key)} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await settle();

    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await settle();
    expect(chosen).toEqual(["duplicate"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("an item's variant is an attribute, and the CSS reads it", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await settle();

    const remove = screen.getByRole("menuitem", { name: "Delete" });
    expect(remove.getAttribute("data-variant")).toBe("destructive");
    expect(rulesFor(remove.className)).toContain('[data-variant="destructive"]');
  });

  test("the arrow keys move through the items", async () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await settle();

    expect(document.activeElement?.textContent).toBe("Rename");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Duplicate");
  });

  test("a checkbox item shows its tick from data-selected, not from a conditional", async () => {
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>View</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          items={[{ id: "status", name: "Status bar" }]}
          aria-label="View"
          selectionMode="multiple"
          defaultSelectedKeys={["status"]}
        >
          {(entry: { id: string; name: string }) => (
            <DropdownMenuCheckboxItem>{entry.name}</DropdownMenuCheckboxItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ));
    await user.click(screen.getByRole("button", { name: "View" }));
    await settle();

    const entry = screen.getByRole("menuitemcheckbox", { name: "Status bar" });
    expect(entry.getAttribute("aria-checked")).toBe("true");
    expect(entry.getAttribute("data-selected")).toBe("");

    const mark = document.querySelector('[data-slot="dropdown-menu-item-indicator"]')!;
    const rules = rulesFor(mark.className);
    expect(rules).toContain("svg{display: none}");
    expect(rules).toContain("[data-selected] .");
  });

  test("a label and a separator are presentational", async () => {
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>More</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent items={ACTIONS} aria-label="More">
          {(action: (typeof ACTIONS)[number]) => (
            <DropdownMenuItem>
              {action.name}
              <DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ));
    await user.click(screen.getByRole("button", { name: "More" }));
    await settle();
    expect(document.querySelector('[data-slot="dropdown-menu-shortcut"]')?.textContent).toBe("⌘R");
    void DropdownMenuLabel;
    void DropdownMenuSeparator;
  });

  test("Escape closes it and focus returns to the trigger", async () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    await user.click(trigger);
    await settle();

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
