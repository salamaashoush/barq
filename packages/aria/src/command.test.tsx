import { describe, expect, test } from "bun:test";
import { createSignal, flush, Show, type Incoming } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  commandScore,
  CommandSeparator,
  type CommandFilter,
} from "./command.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("commandScore", () => {
  test("an exact match is a whole 1 and nothing in common is 0", () => {
    expect(commandScore("billing", "billing")).toBe(1);
    expect(commandScore("billing", "xyz")).toBe(0);
    expect(commandScore("billing", "billings")).toBe(0);
  });

  test("an empty search matches everything, a little short of exactly", () => {
    expect(commandScore("billing", "")).toBeGreaterThan(0);
    expect(commandScore("billing", "")).toBeLessThan(1);
    expect(commandScore("", "")).toBe(1);
  });

  test("a prefix outranks the same letters at a word boundary, which outrank mid-word", () => {
    const prefix = commandScore("settings panel", "se");
    const word = commandScore("open settings", "se");
    const middle = commandScore("reset", "se");
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(0);
  });

  test("a jump to a word after a space outranks one after punctuation", () => {
    expect(commandScore("open file", "of")).toBeGreaterThan(commandScore("open/file", "of"));
    expect(commandScore("open/file", "of")).toBeGreaterThan(commandScore("opinfo", "of"));
  });

  test("letters in a row outrank the same letters with gaps", () => {
    expect(commandScore("calendar", "cal")).toBeGreaterThan(commandScore("calculator", "clr"));
    expect(commandScore("abcdef", "abc")).toBeGreaterThan(commandScore("axbxcx", "abc"));
  });

  test("the further a mid-word match is skipped to, the less it is worth", () => {
    expect(commandScore("ab", "b")).toBeGreaterThan(0);
    expect(commandScore("axb", "ab")).toBeGreaterThan(commandScore("axxxxb", "ab"));
  });

  test("case is ignored, and a matching case is worth a hair more", () => {
    expect(commandScore("Billing", "billing")).toBeGreaterThan(0.99);
    expect(commandScore("Billing", "Billing")).toBeGreaterThan(commandScore("Billing", "billing"));
  });

  test("the letters must come in order, give or take one swap", () => {
    expect(commandScore("calendar", "radnelac")).toBe(0);
    const swapped = commandScore("calendar", "claendar");
    expect(swapped).toBeGreaterThan(0);
    expect(swapped).toBeLessThan(commandScore("calendar", "calendar"));
  });

  test("an unfinished match is worth less than a finished one", () => {
    expect(commandScore("profile", "profile")).toBeGreaterThan(commandScore("profiles", "profile"));
  });

  test("keywords are searched as part of the value", () => {
    expect(commandScore("Billing", "invoice")).toBe(0);
    expect(commandScore("Billing", "invoice", ["invoice", "payment"])).toBeGreaterThan(0);
    expect(commandScore("Billing", "bill", ["invoice"])).toBeGreaterThan(
      commandScore("Billing", "inv", ["invoice"]),
    );
  });

  test("a hyphen and a space are the same separator", () => {
    expect(commandScore("dark-mode", "dark mode")).toBeGreaterThan(0.9);
  });

  test("a plain letter finds an accented one", () => {
    expect(commandScore("Résumé", "resume")).toBeGreaterThan(0.9);
  });
});

function Palette(
  props: Incoming<{
    onSelect?: (value: string) => void;
    onValueChange?: (value: string) => void;
    value?: string;
    loop?: boolean;
    shouldFilter?: boolean;
    filter?: CommandFilter;
    disablePointerSelection?: boolean;
    vimBindings?: boolean;
    search?: string;
    onSearchChange?: (search: string) => void;
    showArchive?: boolean;
    alwaysRender?: boolean;
  }>,
) {
  const run = (value: string): void => props.onSelect?.()?.(value);
  return (
    <Command
      label="Commands"
      value={props.value?.()}
      onValueChange={props.onValueChange?.()}
      loop={props.loop?.()}
      shouldFilter={props.shouldFilter?.()}
      filter={props.filter?.()}
      disablePointerSelection={props.disablePointerSelection?.()}
      vimBindings={props.vimBindings?.()}
    >
      <CommandInput
        placeholder="Type a command"
        value={props.search?.()}
        onValueChange={props.onSearchChange?.()}
      />
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
          <CommandItem onSelect={run}>Profile</CommandItem>
          <CommandItem onSelect={run} value="billing" keywords={["invoice", "payment"]}>
            Billing
          </CommandItem>
          <Show when={props.showArchive?.() === true}>
            <CommandItem onSelect={run}>Archive</CommandItem>
          </Show>
          <CommandItem onSelect={run}>Settings</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function input(): HTMLInputElement {
  return screen.getByRole("combobox");
}

/** The options a person can see, in the order they are drawn. */
function drawn(): string[] {
  const shown = screen
    .getAllByRole("option", { hidden: true })
    .filter((node) => !node.hasAttribute("hidden") && node.closest("[hidden]") === null);
  const orderOf = (node: Element): number => Number((node as HTMLElement).style.order || 0);
  const groupOf = (node: Element): Element | null => node.closest("[cmdk-group]");
  return shown
    .map((node, index) => ({ node, index }))
    .toSorted((a, b) => {
      const left = groupOf(a.node);
      const right = groupOf(b.node);
      if (left !== right) {
        const first = left === null ? orderOf(a.node) : orderOf(left);
        const second = right === null ? orderOf(b.node) : orderOf(right);
        return first - second || a.index - b.index;
      }
      return orderOf(a.node) - orderOf(b.node) || a.index - b.index;
    })
    .map(({ node }) => node.textContent ?? "");
}

function highlighted(): string | undefined {
  const active = input().getAttribute("aria-activedescendant");
  return active === null ? undefined : (document.getElementById(active)?.textContent ?? undefined);
}

describe("Command", () => {
  test("is a combobox over a named listbox of options in labelled groups", async () => {
    render(() => <Palette />);
    await settle();

    const field = input();
    expect(field.getAttribute("aria-expanded")).toBe("true");
    expect(field.getAttribute("aria-autocomplete")).toBe("list");
    expect(accessibleName(field)).toBe("Commands");

    const list = screen.getByRole("listbox");
    expect(field.getAttribute("aria-controls")).toBe(list.getAttribute("id"));
    expect(accessibleName(list)).toBe("Commands");
    expect(screen.getAllByRole("option")).toHaveLength(6);

    const groups = screen.getAllByRole("group");
    expect(
      groups.map(
        (group) =>
          document.getElementById(group.getAttribute("aria-labelledby") ?? "")?.textContent,
      ),
    ).toEqual(["Suggestions", "Settings"]);
    expect(screen.getByRole("separator")).toBeTruthy();
    expectNoAriaViolations(document.body);
  });

  test("the first item is highlighted from the start, and the input says which", async () => {
    render(() => <Palette />);
    await settle();

    expect(highlighted()).toBe("Calendar");
    const first = screen.getByRole("option", { name: "Calendar" });
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(first.getAttribute("data-selected")).toBe("true");
    expect(screen.getByRole("option", { name: "Profile" }).getAttribute("aria-selected")).toBe(
      "false",
    );
    expect(screen.getByRole("option", { name: "Profile" }).hasAttribute("data-selected")).toBe(
      false,
    );
  });

  test("the arrows move the highlight while the focus stays in the input", async () => {
    render(() => <Palette />);
    await settle();
    const field = input();
    field.focus();

    user.keyDown("ArrowDown");
    flush();
    expect(highlighted()).toBe("Search Emoji");
    expect(document.activeElement).toBe(field);

    user.keyDown("ArrowUp");
    flush();
    expect(highlighted()).toBe("Calendar");
  });

  test("a disabled item says so and the arrows step over it", async () => {
    render(() => <Palette />);
    await settle();
    input().focus();

    const calculator = screen.getByRole("option", { name: "Calculator" });
    expect(calculator.getAttribute("aria-disabled")).toBe("true");
    expect(calculator.getAttribute("data-disabled")).toBe("true");

    user.keyDown("ArrowDown");
    user.keyDown("ArrowDown");
    flush();
    expect(highlighted()).toBe("Profile");
  });

  test("the highlight stops at the ends unless asked to loop", async () => {
    render(() => <Palette />);
    await settle();
    input().focus();

    user.keyDown("ArrowUp");
    flush();
    expect(highlighted()).toBe("Calendar");

    user.keyDown("End");
    flush();
    expect(highlighted()).toBe("Settings");
    user.keyDown("ArrowDown");
    flush();
    expect(highlighted()).toBe("Settings");

    user.keyDown("Home");
    flush();
    expect(highlighted()).toBe("Calendar");
  });

  test("loop wraps both ways", async () => {
    render(() => <Palette loop />);
    await settle();
    input().focus();

    user.keyDown("ArrowUp");
    flush();
    expect(highlighted()).toBe("Settings");
    user.keyDown("ArrowDown");
    flush();
    expect(highlighted()).toBe("Calendar");
  });

  test("Alt with an arrow jumps a group, and Meta goes to an end", async () => {
    render(() => <Palette />);
    await settle();
    input().focus();

    user.keyDown("ArrowDown", { altKey: true });
    flush();
    expect(highlighted()).toBe("Profile");
    user.keyDown("ArrowDown");
    user.keyDown("ArrowUp", { altKey: true });
    flush();
    expect(highlighted()).toBe("Calendar");

    user.keyDown("ArrowDown", { metaKey: true });
    flush();
    expect(highlighted()).toBe("Settings");
    user.keyDown("ArrowUp", { metaKey: true });
    flush();
    expect(highlighted()).toBe("Calendar");
  });

  test("Ctrl+J and Ctrl+N go down, Ctrl+K and Ctrl+P go up, unless turned off", async () => {
    const [vim, setVim] = createSignal(true);
    render(() => <Palette vimBindings={vim()} />);
    await settle();
    input().focus();

    user.keyDown("j", { ctrlKey: true });
    flush();
    expect(highlighted()).toBe("Search Emoji");
    user.keyDown("n", { ctrlKey: true });
    flush();
    expect(highlighted()).toBe("Profile");
    user.keyDown("k", { ctrlKey: true });
    user.keyDown("p", { ctrlKey: true });
    flush();
    expect(highlighted()).toBe("Calendar");

    setVim(false);
    flush();
    user.keyDown("j", { ctrlKey: true });
    flush();
    expect(highlighted()).toBe("Calendar");
  });

  test("Enter runs the highlighted item with its value", async () => {
    const ran: string[] = [];
    render(() => <Palette onSelect={(value) => ran.push(value)} />);
    await settle();
    input().focus();

    user.keyDown("Enter");
    user.keyDown("End");
    user.keyDown("ArrowUp");
    flush();
    user.keyDown("Enter");
    expect(ran).toEqual(["Calendar", "billing"]);
  });

  test("Enter does nothing while an input method is composing", async () => {
    const ran: string[] = [];
    render(() => <Palette onSelect={(value) => ran.push(value)} />);
    await settle();
    input().focus();

    input().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        isComposing: true,
      }),
    );
    expect(ran).toEqual([]);
  });

  test("moving the pointer over an item highlights it, and a click runs it", async () => {
    const ran: string[] = [];
    render(() => <Palette onSelect={(value) => ran.push(value)} />);
    await settle();
    const field = input();
    field.focus();

    user.hover(screen.getByRole("option", { name: "Profile" }));
    flush();
    expect(highlighted()).toBe("Profile");

    user.click(screen.getByRole("option", { name: "Settings" }));
    flush();
    expect(ran).toEqual(["Settings"]);
    expect(highlighted()).toBe("Settings");
    expect(document.activeElement).toBe(field);
  });

  test("a disabled item ignores the pointer", async () => {
    const ran: string[] = [];
    render(() => <Palette onSelect={(value) => ran.push(value)} />);
    await settle();

    const calculator = screen.getByRole("option", { name: "Calculator" });
    user.hover(calculator);
    user.click(calculator);
    flush();
    expect(highlighted()).toBe("Calendar");
    expect(ran).toEqual([]);
  });

  test("disablePointerSelection leaves the highlight to the keyboard", async () => {
    render(() => <Palette disablePointerSelection />);
    await settle();

    user.hover(screen.getByRole("option", { name: "Profile" }));
    flush();
    expect(highlighted()).toBe("Calendar");
  });

  test("typing hides what does not match, its group with it, and highlights the first left", async () => {
    render(() => <Palette />);
    await settle();

    user.type(input(), "pro");
    await settle();

    expect(drawn()).toEqual(["Profile"]);
    expect(screen.getAllByRole("option").map((node) => node.textContent)).toEqual(["Profile"]);
    expect(highlighted()).toBe("Profile");

    const groups = [...document.querySelectorAll("[cmdk-group]")];
    expect(groups.map((group) => group.hasAttribute("hidden"))).toEqual([true, false]);
    expect(screen.queryByRole("separator")).toBeNull();
  });

  test("what is left is drawn best match first, and the arrows follow what is drawn", async () => {
    render(() => <Palette />);
    await settle();

    user.type(input(), "i");
    await settle();

    // "invoice" is a keyword that STARTS with the letter, which beats a letter
    // in the middle of a word; the second group holds that match, so the whole
    // group is drawn first.
    expect(drawn()).toEqual(["Billing", "Profile", "Settings", "Search Emoji"]);
    expect(highlighted()).toBe("Billing");

    input().focus();
    user.keyDown("ArrowDown");
    flush();
    expect(highlighted()).toBe("Profile");
    user.keyDown("End");
    flush();
    expect(highlighted()).toBe("Search Emoji");

    const options = screen.getAllByRole("option");
    expect(options.map((node) => node.getAttribute("aria-setsize"))).toEqual(["4", "4", "4", "4"]);
    expect(
      Object.fromEntries(
        options.map((node) => [node.textContent, node.getAttribute("aria-posinset")]),
      ),
    ).toEqual({ Billing: "1", Profile: "2", Settings: "3", "Search Emoji": "4" });
  });

  test("clearing the search puts everything back where it was written", async () => {
    render(() => <Palette />);
    await settle();

    user.type(input(), "i");
    await settle();
    user.clear(input());
    await settle();

    expect(drawn()).toEqual([
      "Calendar",
      "Search Emoji",
      "Calculator",
      "Profile",
      "Billing",
      "Settings",
    ]);
    expect(highlighted()).toBe("Calendar");
    expect(screen.getByRole("separator")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Calendar" }).hasAttribute("aria-posinset")).toBe(
      false,
    );
  });

  test("an item is found by its keywords as well as its value", async () => {
    render(() => <Palette />);
    await settle();

    user.type(input(), "invoice");
    await settle();
    expect(drawn()).toEqual(["Billing"]);
  });

  test("the empty state shows only when nothing matches", async () => {
    render(() => <Palette />);
    await settle();
    expect(document.querySelector("[cmdk-empty]")).toBeNull();

    user.type(input(), "zzz");
    await settle();
    expect(document.querySelector("[cmdk-empty]")?.textContent).toBe("No results found.");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  });

  test("a separator can ask to stay through a search", async () => {
    render(() => <Palette alwaysRender />);
    await settle();

    user.type(input(), "pro");
    await settle();
    expect(screen.getByRole("separator")).toBeTruthy();
  });

  test("shouldFilter false leaves every item in place whatever is typed", async () => {
    render(() => <Palette shouldFilter={false} />);
    await settle();

    user.type(input(), "zzz");
    await settle();
    expect(drawn()).toHaveLength(6);
    expect(document.querySelector("[cmdk-empty]")).toBeNull();
  });

  test("a custom filter decides what matches and how well", async () => {
    const seen: [string, string, string[]][] = [];
    const filter: CommandFilter = (value, search, keywords) => {
      seen.push([value, search, keywords]);
      return value.endsWith(search) ? value.length : 0;
    };
    render(() => <Palette filter={filter} />);
    await settle();

    user.type(input(), "r");
    await settle();
    expect(drawn()).toEqual(["Calculator", "Calendar"]);
    expect(seen).toContainEqual(["billing", "r", ["invoice", "payment"]]);
  });

  test("the highlighted value is reported as it moves", async () => {
    const values: string[] = [];
    render(() => <Palette onValueChange={(value) => values.push(value)} />);
    await settle();
    input().focus();

    user.keyDown("ArrowDown");
    flush();
    user.keyDown("End");
    flush();
    user.keyDown("ArrowUp");
    flush();
    expect(values).toEqual(["Calendar", "Search Emoji", "Settings", "billing"]);
  });

  test("a controlled value decides the highlight", async () => {
    const [value, setValue] = createSignal("billing");
    const asked: string[] = [];
    render(() => <Palette value={value()} onValueChange={(next) => asked.push(next)} />);
    await settle();
    expect(highlighted()).toBe("Billing");

    input().focus();
    user.keyDown("ArrowDown");
    flush();
    expect(asked).toEqual(["Settings"]);
    expect(highlighted()).toBe("Billing");

    setValue("Profile");
    flush();
    expect(highlighted()).toBe("Profile");
  });

  test("a controlled search is what the input shows and what filters", async () => {
    const [search, setSearch] = createSignal("pro");
    const typed: string[] = [];
    render(() => <Palette search={search()} onSearchChange={(next) => typed.push(next)} />);
    await settle();

    expect(input().value).toBe("pro");
    expect(drawn()).toEqual(["Profile"]);

    user.type(input(), "x");
    await settle();
    expect(typed).toEqual(["prox"]);
    expect(input().value).toBe("pro");
    expect(drawn()).toEqual(["Profile"]);

    setSearch("cal");
    await settle();
    expect(input().value).toBe("cal");
    expect(drawn()).toEqual(["Calendar", "Calculator"]);
  });

  test("an item that arrives later joins the path where it is written", async () => {
    const [archive, setArchive] = createSignal(false);
    render(() => <Palette showArchive={archive()} />);
    await settle();

    setArchive(true);
    await settle();
    input().focus();
    user.keyDown("End");
    user.keyDown("ArrowUp");
    flush();
    expect(highlighted()).toBe("Archive");
  });

  test("when the highlighted item leaves, the first one takes over", async () => {
    const [archive, setArchive] = createSignal(true);
    render(() => <Palette showArchive={archive()} />);
    await settle();
    input().focus();
    user.keyDown("End");
    user.keyDown("ArrowUp");
    flush();
    expect(highlighted()).toBe("Archive");

    setArchive(false);
    await settle();
    expect(highlighted()).toBe("Calendar");
  });

  test("forceMount keeps an item, or a whole group, through a search", async () => {
    render(() => (
      <Command label="Commands">
        <CommandInput />
        <CommandList>
          <CommandItem forceMount>Always here</CommandItem>
          <CommandItem>Sometimes</CommandItem>
          <CommandGroup heading="Pinned" forceMount>
            <CommandItem>Kept</CommandItem>
          </CommandGroup>
          <CommandGroup heading="Other">
            <CommandItem>Dropped</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    ));
    await settle();

    user.type(input(), "zzz");
    await settle();
    expect(drawn()).toEqual(["Always here", "Kept"]);
  });

  test("items outside any group are ranked among themselves, ahead of the groups", async () => {
    render(() => (
      <Command label="Commands">
        <CommandInput />
        <CommandList>
          <CommandGroup heading="Files">
            <CommandItem>Open</CommandItem>
          </CommandGroup>
          <CommandItem>Reopen</CommandItem>
          <CommandItem>Open recent</CommandItem>
        </CommandList>
      </Command>
    ));
    await settle();

    user.type(input(), "open");
    await settle();
    expect(drawn()).toEqual(["Open recent", "Reopen", "Open"]);
    expect(highlighted()).toBe("Open recent");
  });

  test("the highlighted item is scrolled into view, and a new search starts from the top", async () => {
    // happy-dom lays nothing out, so the two boxes are stated.
    const box = (top: number, bottom: number): DOMRect =>
      ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top }) as DOMRect;
    render(() => <Palette />);
    await settle();

    const list = screen.getByRole("listbox");
    list.getBoundingClientRect = () => box(0, 100);
    screen.getByRole("option", { name: "Settings" }).getBoundingClientRect = () => box(260, 290);

    input().focus();
    user.keyDown("End");
    flush();
    expect(list.scrollTop).toBe(190);

    user.type(input(), "s");
    await settle();
    expect(list.scrollTop).toBe(0);
  });

  test("a loading row is a progress bar with a name", async () => {
    render(() => (
      <Command label="Commands">
        <CommandInput />
        <CommandList>
          <CommandLoading progress={40}>Fetching</CommandLoading>
        </CommandList>
      </Command>
    ));
    await settle();

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(accessibleName(bar)).toBe("Loading...");
  });

  test("every part carries the attribute cmdk's own selectors read", async () => {
    render(() => <Palette />);
    await settle();
    for (const name of [
      "cmdk-root",
      "cmdk-input",
      "cmdk-list",
      "cmdk-group",
      "cmdk-group-heading",
      "cmdk-group-items",
      "cmdk-item",
      "cmdk-separator",
    ]) {
      expect(document.querySelector(`[${name}]`), name).not.toBeNull();
    }
    expect(screen.getByRole("option", { name: "Billing" }).getAttribute("data-value")).toBe(
      "billing",
    );
  });
});
