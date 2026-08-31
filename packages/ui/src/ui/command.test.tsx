import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { Command, CommandItem, CommandShortcut } from "./command.tsx";

const COMMANDS = [
  { id: "new", name: "New file", keys: "⌘N" },
  { id: "open", name: "Open file", keys: "⌘O" },
  { id: "search", name: "Search the project", keys: "⌘F" },
];

function Fixture(props: Incoming<{ onAction?: (key: string) => void }>) {
  return (
    <Command
      items={COMMANDS}
      placeholder="Type a command"
      aria-label="Commands"
      // `?.()?.(…)`: a component's props are Cells, so the first call unwraps
      // the handler and the second one runs it.
      onAction={(key) => props.onAction?.()?.(String(key))}
    >
      {(entry: (typeof COMMANDS)[number]) => (
        <CommandItem>
          {entry.name}
          <CommandShortcut>{entry.keys}</CommandShortcut>
        </CommandItem>
      )}
    </Command>
  );
}

function names(): string[] {
  return screen.getAllByRole("option").map((node) => node.textContent ?? "");
}

describe("Command", () => {
  test("the input is a combobox over the list", () => {
    render(() => <Fixture />);
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox", { name: "Commands" })).toBeTruthy();
    expect(names()).toHaveLength(3);
  });

  test("typing narrows the list", async () => {
    render(() => <Fixture />);
    await user.type(screen.getByRole("combobox"), "open");
    flush();
    expect(names().map((text) => text.slice(0, 9))).toEqual(["Open file"]);
  });

  test("the match is locale-aware, so a plain letter finds an accented one", async () => {
    render(() => (
      <Command items={[{ id: "cv", name: "Résumé" }]} aria-label="Commands">
        {(entry: { id: string; name: string }) => <CommandItem>{entry.name}</CommandItem>}
      </Command>
    ));
    await user.type(screen.getByRole("combobox"), "resume");
    flush();
    expect(names()).toEqual(["Résumé"]);
  });

  test("nothing matching shows the empty state instead of an empty list", async () => {
    render(() => <Fixture />);
    await user.type(screen.getByRole("combobox"), "zzz");
    flush();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.querySelector('[data-slot="command-empty"]')?.textContent).toBe(
      "No results found.",
    );
  });

  test("the focus stays in the input while the arrows move the list", async () => {
    render(() => <Fixture />);
    const input = screen.getByRole("combobox");
    input.focus();
    await user.keyboard("{ArrowDown}");
    flush();

    expect(document.activeElement).toBe(input);
    const active = input.getAttribute("aria-activedescendant");
    expect(active).not.toBeNull();
    expect(document.getElementById(active ?? "")?.textContent).toContain("New file");
  });

  test("Enter runs the highlighted command", async () => {
    const ran: string[] = [];
    render(() => <Fixture onAction={(key) => ran.push(key)} />);
    const input = screen.getByRole("combobox");
    input.focus();
    await user.keyboard("{ArrowDown}");
    flush();
    await user.keyboard("{Enter}");
    flush();
    expect(ran).toEqual(["new"]);
  });

  test("running the same command twice works, because nothing stays selected", async () => {
    const ran: string[] = [];
    render(() => <Fixture onAction={(key) => ran.push(key)} />);
    const input = screen.getByRole("combobox");
    // The SAME item twice, without moving between: the selection is cleared
    // after each run, so the second Enter is a change again rather than a
    // no-op.
    input.focus();
    await user.keyboard("{ArrowDown}");
    flush();
    await user.keyboard("{Enter}");
    flush();
    await user.keyboard("{Enter}");
    flush();
    expect(ran).toEqual(["new", "new"]);
  });

  test("every part is reachable by its slot", () => {
    render(() => <Fixture />);
    for (const name of [
      "command",
      "command-input-wrapper",
      "command-input",
      "command-list",
      "command-item",
      "command-shortcut",
    ]) {
      expect(document.querySelector(`[data-slot="${name}"]`)).not.toBeNull();
    }
  });
});
