import { describe, expect, test } from "bun:test";
import { createSignal, flush, type Incoming } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandSeparator,
  CommandShortcut,
} from "./command.tsx";

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

/** The portal builds on a microtask after its marker connects. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

/**
 * The palette as shadcn writes it: parts as children, each item saying what it
 * does, and nothing rendered from data.
 */
describe("a Command written as children", () => {
  function Written(
    props: Incoming<{ onSelect?: (value: string) => void; loop?: boolean; alwaysRender?: boolean }>,
  ) {
    const run = (value: string): void => props.onSelect?.()?.(value);
    return (
      <Command label="Commands" loop={props.loop?.()}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem onSelect={run}>Calendar</CommandItem>
            <CommandItem onSelect={run}>Search Emoji</CommandItem>
            <CommandItem onSelect={run} disabled>
              Calculator
            </CommandItem>
          </CommandGroup>
          <CommandSeparator alwaysRender={props.alwaysRender?.()} />
          <CommandGroup heading="Settings">
            <CommandItem onSelect={run}>
              Profile
              <CommandShortcut>⌘P</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run} value="billing" keywords={["invoice"]}>
              Billing
              <CommandShortcut>⌘B</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    );
  }

  function highlighted(): string | undefined {
    const active = screen.getByRole("combobox").getAttribute("aria-activedescendant");
    return active === null ? undefined : (document.getElementById(active)?.textContent ?? "");
  }

  test("every part carries upstream's slot, and the attribute cmdk's selectors read", async () => {
    render(() => <Written />);
    await settle();

    for (const name of [
      "command",
      "command-input-wrapper",
      "command-input",
      "command-list",
      "command-group",
      "command-item",
      "command-separator",
      "command-shortcut",
    ]) {
      expect(document.querySelector(`[data-slot="${name}"]`), name).not.toBeNull();
    }
    expect(
      document
        .querySelector('[data-slot="command-input-wrapper"]')
        ?.hasAttribute("cmdk-input-wrapper"),
    ).toBe(true);
    const heading = document.querySelector("[cmdk-group-heading]");
    expect(heading?.textContent).toBe("Suggestions");
    expect(heading?.closest('[data-slot="command-group"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="command-item"]')?.hasAttribute("cmdk-item")).toBe(
      true,
    );
  });

  test("the input is a combobox over a named listbox, with the groups named by their headings", async () => {
    render(() => <Written />);
    await settle();

    const input = screen.getByRole("combobox", { name: "Commands" });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("placeholder")).toBe("Type a command or search...");
    const list = screen.getByRole("listbox", { name: "Commands" });
    expect(input.getAttribute("aria-controls")).toBe(list.getAttribute("id"));
    expect(screen.getAllByRole("option")).toHaveLength(5);
    expect(screen.getByRole("group", { name: "Settings" })).toBeTruthy();
    expectNoAriaViolations(document.body);
  });

  test("the highlighted item says so in both vocabularies, and the look reads it", async () => {
    render(() => <Written />);
    await settle();

    const first = screen.getByRole("option", { name: "Calendar" });
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(first.getAttribute("data-selected")).toBe("true");
    expect(first.getAttribute("data-focused")).toBe("");
    expect(rulesFor(first.className)).toContain("[data-focused]");

    const other = screen.getByRole("option", { name: "Search Emoji" });
    expect(other.hasAttribute("data-selected")).toBe(false);
    expect(other.hasAttribute("data-focused")).toBe(false);
  });

  test("a disabled item says so the way upstream's selector asks", async () => {
    render(() => <Written />);
    await settle();

    const calculator = screen.getByRole("option", { name: "Calculator" });
    expect(calculator.getAttribute("data-disabled")).toBe("true");
    expect(calculator.getAttribute("aria-disabled")).toBe("true");
  });

  test("typing narrows the list to what matches, best first", async () => {
    render(() => <Written />);
    await settle();

    await user.type(screen.getByRole("combobox"), "invoice");
    await settle();
    expect(screen.getAllByRole("option").map((node) => node.textContent)).toEqual(["Billing⌘B"]);
    expect(highlighted()).toBe("Billing⌘B");
    expect(document.querySelector('[data-slot="command-separator"]')).toBeNull();
  });

  test("an item that does not match is hidden, and its look does not undo that", async () => {
    render(() => <Written />);
    await settle();

    await user.type(screen.getByRole("combobox"), "pro");
    await settle();
    const calendar = [...document.querySelectorAll('[data-slot="command-item"]')].find(
      (node) => node.textContent === "Calendar",
    );
    expect(calendar?.hasAttribute("hidden")).toBe(true);
    // The row is `display: flex`, which would otherwise beat the attribute.
    expect(rulesFor(calendar?.className ?? "")).toContain("[hidden]{display: none}");
  });

  test("nothing matching shows the empty state, and only then", async () => {
    render(() => <Written />);
    await settle();
    expect(document.querySelector('[data-slot="command-empty"]')).toBeNull();

    await user.type(screen.getByRole("combobox"), "zzz");
    await settle();
    expect(document.querySelector('[data-slot="command-empty"]')?.textContent).toBe(
      "No results found.",
    );
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  test("the arrows move the highlight past a disabled item, and the focus stays put", async () => {
    render(() => <Written />);
    await settle();
    const input = screen.getByRole("combobox");
    input.focus();

    await user.keyboard("{ArrowDown}{ArrowDown}");
    flush();
    expect(highlighted()).toBe("Profile⌘P");
    expect(document.activeElement).toBe(input);

    await user.keyboard("{End}{ArrowDown}");
    flush();
    expect(highlighted()).toBe("Billing⌘B");
  });

  test("loop carries the highlight round the ends", async () => {
    render(() => <Written loop />);
    await settle();
    screen.getByRole("combobox").focus();

    await user.keyboard("{ArrowUp}");
    flush();
    expect(highlighted()).toBe("Billing⌘B");
    await user.keyboard("{ArrowDown}");
    flush();
    expect(highlighted()).toBe("Calendar");
  });

  test("Enter and a click each run the item's own onSelect with its value", async () => {
    const ran: string[] = [];
    render(() => <Written onSelect={(value) => ran.push(value)} />);
    await settle();
    screen.getByRole("combobox").focus();

    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("option", { name: "Billing ⌘B" }));
    await user.click(screen.getByRole("option", { name: "Calculator" }));
    flush();
    expect(ran).toEqual(["Calendar", "billing"]);
  });

  test("a separator leaves during a search unless it asks to stay", async () => {
    render(() => <Written alwaysRender />);
    await settle();

    await user.type(screen.getByRole("combobox"), "pro");
    await settle();
    expect(screen.getByRole("separator").getAttribute("data-slot")).toBe("command-separator");
  });

  test("the shortcut is pushed to the end of the line, whichever way the text runs", async () => {
    render(() => <Written />);
    await settle();
    const shortcut = document.querySelector('[data-slot="command-shortcut"]');
    const rules = rulesFor(shortcut?.className ?? "");
    expect(rules).toContain("margin-inline-start: auto");
    expect(rules).not.toContain("margin-left");
  });

  test("a loading row is a named progress bar", async () => {
    render(() => (
      <Command label="Commands">
        <CommandInput />
        <CommandList>
          <CommandLoading>Fetching commands</CommandLoading>
        </CommandList>
      </Command>
    ));
    await settle();
    const bar = screen.getByRole("progressbar", { name: "Loading..." });
    expect(bar.getAttribute("data-slot")).toBe("command-loading");
  });
});

describe("CommandDialog", () => {
  function Palette(
    props: Incoming<{
      isOpen?: boolean;
      open?: boolean;
      showCloseButton?: boolean;
      onOpenChange?: (isOpen: boolean) => void;
      onSelect?: (value: string) => void;
    }>,
  ) {
    return (
      <CommandDialog
        isOpen={props.isOpen?.()}
        open={props.open?.()}
        showCloseButton={props.showCloseButton?.()}
        onOpenChange={props.onOpenChange?.()}
        title="Actions"
        description="Search for something to do."
      >
        <CommandInput placeholder="Search" />
        <CommandList>
          <CommandItem onSelect={(value) => props.onSelect?.()?.(value)}>Profile</CommandItem>
          <CommandItem>Billing</CommandItem>
        </CommandList>
      </CommandDialog>
    );
  }

  test("nothing is in the document until it opens", () => {
    render(() => <Palette />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  test("open, it is a dialog named and described for a screen reader, holding the palette", async () => {
    render(() => <Palette isOpen />);
    await settle();

    const dialog = screen.getByRole("dialog", { name: "Actions" });
    const described = dialog.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(described)?.textContent).toBe("Search for something to do.");
    expect(dialog.querySelector('[data-slot="command"]')).not.toBeNull();
    expect(screen.getAllByRole("option").map((node) => node.textContent)).toEqual([
      "Profile",
      "Billing",
    ]);
  });

  test("upstream's `open` opens it too", async () => {
    render(() => <Palette open />);
    await settle();
    expect(screen.getByRole("dialog", { name: "Actions" })).toBeTruthy();
  });

  test("the close button is there only when asked for", async () => {
    const [shown, setShown] = createSignal(false);
    render(() => <Palette isOpen showCloseButton={shown()} />);
    await settle();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

    setShown(true);
    await settle();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  test("Enter runs the highlighted item, and Escape asks to close", async () => {
    const ran: string[] = [];
    const asked: boolean[] = [];
    render(() => (
      <Palette
        isOpen
        onSelect={(value) => ran.push(value)}
        onOpenChange={(isOpen) => asked.push(isOpen)}
      />
    ));
    await settle();

    screen.getByRole("combobox").focus();
    await user.keyboard("{Enter}");
    expect(ran).toEqual(["Profile"]);

    await user.keyboard("{Escape}");
    await settle();
    expect(asked).toEqual([false]);
  });

  test("it still takes its items as data", async () => {
    render(() => (
      <CommandDialog isOpen items={COMMANDS} aria-label="Commands">
        {(entry: (typeof COMMANDS)[number]) => <CommandItem>{entry.name}</CommandItem>}
      </CommandDialog>
    ));
    await settle();
    expect(names()).toEqual(["New file", "Open file", "Search the project"]);
  });
});
