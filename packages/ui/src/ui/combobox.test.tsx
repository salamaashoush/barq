import { describe, expect, test } from "bun:test";
import { flush, For, type Incoming } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxClear,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from "./combobox.tsx";
import { InputGroupAddon } from "./input-group.tsx";

const FRAMEWORKS = [
  { id: "barq", name: "Barq" },
  { id: "solid", name: "Solid" },
  { id: "svelte", name: "Svelte" },
];

/** The portal builds on a microtask after the marker connects. */
async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

function Fixture(props: Incoming<{ onChange?: (key: string | null) => void }>) {
  return (
    <Combobox
      items={FRAMEWORKS}
      placeholder="Select a framework"
      aria-label="Framework"
      label={(entry: (typeof FRAMEWORKS)[number]) => entry.name}
      onChange={(key) => props.onChange?.()?.(key === null ? null : String(key))}
    />
  );
}

describe("Combobox", () => {
  test("the trigger shows the placeholder until something is chosen", () => {
    render(() => <Fixture />);
    expect(screen.getByRole("button").textContent).toContain("Select a framework");
  });

  test("opening it shows a searchable list", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button"));
    await settle();
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getAllByRole("option").map((n) => n.textContent)).toEqual([
      "Barq",
      "Solid",
      "Svelte",
    ]);
  });

  test("the trigger is not itself a combobox, because the input is", async () => {
    render(() => <Fixture />);
    const button = screen.getByRole("button");
    await user.click(button);
    await settle();
    expect(button.getAttribute("role")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  test("typing narrows it and choosing closes it", async () => {
    const picked: (string | null)[] = [];
    render(() => <Fixture onChange={(key) => picked.push(key)} />);
    await user.click(screen.getByRole("button"));
    await settle();

    await user.type(screen.getByRole("combobox"), "sv");
    flush();
    expect(screen.getAllByRole("option").map((n) => n.textContent)).toEqual(["Svelte"]);

    await user.click(screen.getByRole("option"));
    await settle();
    expect(picked).toEqual(["svelte"]);
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByRole("button").textContent).toContain("Svelte");
  });

  test("choosing what is already chosen clears it", async () => {
    const picked: (string | null)[] = [];
    render(() => <Fixture onChange={(key) => picked.push(key)} />);
    await user.click(screen.getByRole("button"));
    await settle();
    await user.click(screen.getAllByRole("option")[0]!);
    await settle();

    await user.click(screen.getByRole("button"));
    await settle();
    await user.click(screen.getAllByRole("option")[0]!);
    await settle();
    expect(picked).toEqual(["barq", null]);
  });

  test("the list is as wide as the trigger, not as wide as the page", async () => {
    // `width: 100%` on a PORTALLED popover resolves against the body, so the
    // list came out 1265px under a 384px trigger. `overlayPosition` publishes
    // the measurement and the rule reads it.
    render(() => <Fixture />);
    await user.click(screen.getByRole("button"));
    await settle();

    const content = document.querySelector('[data-slot="combobox-content"]') as HTMLElement;
    const rules = rulesFor(content.className);
    expect(rules).toContain("width: var(--barq-trigger-width");
    expect(rules).not.toContain("width: 100%");
  });

  test("the chosen entry is ticked", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button"));
    await settle();
    await user.click(screen.getAllByRole("option")[0]!);
    await settle();

    await user.click(screen.getByRole("button"));
    await settle();
    const ticked = [...document.querySelectorAll('[data-slot="combobox-item-indicator"]')];
    expect(ticked.length).toBe(1);
    expect(ticked[0]?.closest('[data-slot="combobox-item"]')?.textContent).toContain("Barq");
  });
});

function Many(props: Incoming<{ onValuesChange?: (keys: readonly string[]) => void }>) {
  return (
    <Combobox
      multiple
      items={FRAMEWORKS}
      placeholder="Pick some"
      aria-label="Frameworks"
      label={(entry: (typeof FRAMEWORKS)[number]) => entry.name}
      onValuesChange={(keys) => props.onValuesChange?.()?.(keys.map(String))}
    />
  );
}

const slot = (name: string): HTMLElement | null => document.querySelector(`[data-slot="${name}"]`);

describe("a Combobox holding several values", () => {
  test("the box is a div, because the chips inside carry buttons", async () => {
    // A button inside a button is markup no browser renders and no screen
    // reader can describe.
    render(() => <Many />);
    const box = slot("combobox-chips");
    expect(box).not.toBeNull();
    expect(box?.tagName.toLowerCase()).toBe("div");
    expect(rulesFor(box?.className ?? "")).toContain(":focus-within");
  });

  test("choosing adds a chip and leaves the list open", async () => {
    // Choosing four things and having the list close four times is four
    // reopenings nobody asked for.
    const seen: (readonly string[])[] = [];
    render(() => <Many onValuesChange={(keys) => seen.push(keys)} />);
    await user.click(screen.getByRole("button", { name: /Frameworks|Pick some/ }));
    await settle();

    await user.click(screen.getByRole("option", { name: "Barq" }));
    await settle();
    expect(seen.at(-1)).toEqual(["barq"]);
    expect(screen.queryByRole("listbox")).not.toBeNull();

    await user.click(screen.getByRole("option", { name: "Svelte" }));
    await settle();
    expect(seen.at(-1)).toEqual(["barq", "svelte"]);
    expect(document.querySelectorAll('[data-slot="combobox-chip"]')).toHaveLength(2);
  });

  test("choosing the same one again takes it off", async () => {
    const seen: (readonly string[])[] = [];
    render(() => <Many onValuesChange={(keys) => seen.push(keys)} />);
    await user.click(screen.getByRole("button", { name: /Frameworks|Pick some/ }));
    await settle();
    await user.click(screen.getByRole("option", { name: "Barq" }));
    await settle();
    await user.click(screen.getByRole("option", { name: "Barq" }));
    await settle();
    expect(seen.at(-1)).toEqual([]);
  });

  test("the tick follows the SET, not a single value", async () => {
    render(() => <Many />);
    await user.click(screen.getByRole("button", { name: /Frameworks|Pick some/ }));
    await settle();
    await user.click(screen.getByRole("option", { name: "Barq" }));
    await settle();
    expect(document.querySelectorAll('[data-slot="combobox-item-indicator"]')).toHaveLength(1);
  });

  test("a chip's remove button takes that one off and names which", async () => {
    const seen: (readonly string[])[] = [];
    render(() => <Many onValuesChange={(keys) => seen.push(keys)} />);
    await user.click(screen.getByRole("button", { name: /Frameworks|Pick some/ }));
    await settle();
    await user.click(screen.getByRole("option", { name: "Barq" }));
    await settle();
    await user.keyboard("{Escape}");
    await settle();

    const remove = slot("combobox-chip-remove") as HTMLElement;
    // Named, because "Remove" three times over is three buttons a screen
    // reader cannot tell apart.
    expect(remove.textContent).toContain("Remove barq");
    await user.click(remove);
    await settle();
    expect(seen.at(-1)).toEqual([]);
    expect(slot("combobox-chip")).toBeNull();
  });

  test("a press on a chip while the list is open DISMISSES first", async () => {
    // The chips sit outside the popover, so the first press is an interaction
    // outside it and the popover takes it. Radix does the same, and the
    // alternative is a list that stays up while the thing under it changes.
    const seen: (readonly string[])[] = [];
    render(() => <Many onValuesChange={(keys) => seen.push(keys)} />);
    await user.click(screen.getByRole("button", { name: /Frameworks|Pick some/ }));
    await settle();
    await user.click(screen.getByRole("option", { name: "Barq" }));
    await settle();
    expect(screen.queryByRole("listbox")).not.toBeNull();

    await user.click(slot("combobox-chip-remove") as HTMLElement);
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(seen.at(-1)).toEqual(["barq"]);

    await user.click(slot("combobox-chip-remove") as HTMLElement);
    await settle();
    expect(seen.at(-1)).toEqual([]);
  });

  test("the empty state is named after the combobox, not after the command", async () => {
    // A rule for `command-empty` would reach every palette on the page.
    render(() => <Many />);
    await user.click(screen.getByRole("button", { name: /Frameworks|Pick some/ }));
    await settle();
    const input = screen.getByRole("combobox");
    await user.type(input, "zzzz");
    await settle();
    expect(slot("combobox-empty")).not.toBeNull();
    expect(slot("command-empty")).toBeNull();
  });

  test("a single-value combobox is untouched: it still closes on choosing", async () => {
    const seen: (string | null)[] = [];
    render(() => <Fixture onChange={(key) => seen.push(key)} />);
    await user.click(screen.getByRole("button"));
    await settle();
    await user.click(screen.getByRole("option", { name: "Barq" }));
    await settle();
    expect(seen).toEqual(["barq"]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(slot("combobox-chips")).toBeNull();
  });
});

describe("a children callback that builds an element", () => {
  test("works, which it did not: it arrives as a Block and was called as a Cell", async () => {
    // The doc said children "has to return JSX" and the code read it by
    // CALLING it, which is right for `{(entry) => entry.name}` and throws
    // "a Block was invoked without a scope" for anything that builds an
    // element.
    render(() => (
      <Combobox items={FRAMEWORKS} placeholder="Pick" aria-label="Framework">
        {(entry: (typeof FRAMEWORKS)[number]) => <span>{entry.name}</span>}
      </Combobox>
    ));
    await user.click(document.querySelector('[data-slot="combobox-trigger"]') as HTMLElement);
    await settle();
    expect(screen.getAllByRole("option").map((each) => each.textContent)).toEqual([
      "Barq",
      "Solid",
      "Svelte",
    ]);
  });
});

describe("a Combobox with grouped options", () => {
  const GROUPS = [
    { id: "js", name: "JavaScript", options: [{ id: "barq", name: "Barq" }] },
    { id: "other", name: "Other", options: [{ id: "htmx", name: "htmx" }] },
  ];

  function Grouped() {
    return (
      <Combobox
        items={GROUPS}
        aria-label="Framework"
        placeholder="Pick"
        getChildren={(group: { options?: unknown[] }) =>
          group.options as { id: string; name: string; options?: unknown[] }[] | undefined
        }
      >
        {(value: { id: string; name: string; options?: unknown[] }) =>
          value.options === undefined ? (
            <span>{value.name}</span>
          ) : (
            <ComboboxLabel title={value.name} />
          )
        }
      </Combobox>
    );
  }

  test("the options under a heading are built by the list's own callback", async () => {
    // Passing the callback to each group by hand is how the two come to
    // disagree about what an option looks like.
    render(() => <Grouped />);
    await user.click(document.querySelector('[data-slot="combobox-trigger"]') as HTMLElement);
    await settle();
    expect(screen.getAllByRole("option").map((each) => each.textContent)).toEqual(["Barq", "htmx"]);
  });

  test("the heading names the group, and is not an option itself", async () => {
    render(() => <Grouped />);
    await user.click(document.querySelector('[data-slot="combobox-trigger"]') as HTMLElement);
    await settle();
    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(2);
    const named = groups[0]?.getAttribute("aria-labelledby");
    expect(document.getElementById(named ?? "")?.textContent).toBe("JavaScript");
    expect(slot("combobox-label")).not.toBeNull();
  });

  test("a separator is a rule between two runs, and not an option", () => {
    render(() => <ComboboxSeparator />);
    const rule = slot("combobox-separator");
    expect(rule?.getAttribute("role")).toBe("separator");
    expect(rulesFor(rule?.className ?? "")).toContain("height: 1px");
  });
});

/**
 * The combobox written as parts, which is how upstream writes it: an input in
 * an input group, a content panel, a list, and an item per choice.
 */
const NAMES = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"];

async function opened(): Promise<void> {
  flush();
  await tick();
  flush();
}

function field(): HTMLInputElement {
  return screen.getByRole("combobox") as HTMLInputElement;
}

interface PartsProps {
  defaultValue?: string;
  showTrigger?: boolean;
  showClear?: boolean;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  onValueChange?: (value: string | null) => void;
}

function Parts(props: Incoming<PartsProps>) {
  return (
    <Combobox
      items={NAMES}
      defaultValue={props.defaultValue?.()}
      onValueChange={(value) => props.onValueChange?.()?.(value as string | null)}
    >
      <ComboboxInput
        aria-label="Framework"
        placeholder="Select a framework"
        showTrigger={props.showTrigger?.()}
        showClear={props.showClear?.()}
      />
      <ComboboxContent side={props.side?.()} align={props.align?.()}>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => <ComboboxItem value={item}>{item}</ComboboxItem>}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

describe("a Combobox written as parts", () => {
  test("the input is a combobox inside an input group, with a toggle beside it", () => {
    render(() => <Parts />);
    const input = field();
    expect(input.getAttribute("data-slot")).toBe("input-group-control");
    expect(input.getAttribute("placeholder")).toBe("Select a framework");
    expect(input.closest('[data-slot="input-group"]')).not.toBeNull();

    const toggle = slot("combobox-trigger") as HTMLElement;
    expect(toggle.tagName.toLowerCase()).toBe("button");
    expect(toggle.getAttribute("aria-haspopup")).toBe("listbox");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Show suggestions");
    expect(slot("combobox-trigger-icon")).not.toBeNull();
    expect(slot("combobox-content")).toBeNull();
  });

  test("the toggle opens a named list of the items, each in its slot", async () => {
    render(() => <Parts />);
    await user.click(slot("combobox-trigger") as HTMLElement);
    await opened();

    const list = screen.getByRole("listbox");
    expect(list.getAttribute("data-slot")).toBe("combobox-list");
    expect(list.getAttribute("aria-label")).toBe("Framework");
    expect(list.closest('[data-slot="combobox-content"]')).not.toBeNull();
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(NAMES);
    expect(options.every((option) => option.getAttribute("data-slot") === "combobox-item")).toBe(
      true,
    );
    expect(document.activeElement).toBe(field());
  });

  test("typing narrows the list, and the arrows and Enter choose from it", async () => {
    const chosen: (string | null)[] = [];
    render(() => <Parts onValueChange={(value) => chosen.push(value)} />);
    field().focus();
    await user.type(field(), "s");
    await opened();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Next.js",
      "SvelteKit",
      "Nuxt.js",
      "Astro",
    ]);

    await user.keyboard("{ArrowDown}{ArrowDown}");
    const active = document.getElementById(field().getAttribute("aria-activedescendant") ?? "");
    expect(active?.textContent).toBe("SvelteKit");
    expect(active?.hasAttribute("data-highlighted")).toBe(true);
    expect(rulesFor(active?.className ?? "")).toContain("[data-highlighted]");

    await user.keyboard("{Enter}");
    await opened();
    expect(chosen).toEqual(["SvelteKit"]);
    expect(field().value).toBe("SvelteKit");
    expect(slot("combobox-content")).toBeNull();
  });

  test("the chosen item is ticked, and says so in both vocabularies", async () => {
    render(() => <Parts defaultValue="Remix" />);
    await user.click(slot("combobox-trigger") as HTMLElement);
    await opened();

    const ticks = [...document.querySelectorAll('[data-slot="combobox-item-indicator"]')];
    expect(ticks).toHaveLength(1);
    const chosen = ticks[0]?.closest('[data-slot="combobox-item"]');
    expect(chosen?.textContent).toBe("Remix");
    expect(chosen?.getAttribute("aria-selected")).toBe("true");
    expect(chosen?.getAttribute("data-state")).toBe("checked");
    expect(chosen?.hasAttribute("data-selected")).toBe(true);
  });

  test("the empty state is shown by the content, not by a conditional", async () => {
    render(() => <Parts />);
    field().focus();
    await user.type(field(), "zzz");
    await opened();

    const empty = slot("combobox-empty") as HTMLElement;
    expect(empty.textContent).toBe("No items found.");
    expect(empty.getAttribute("role")).toBe("status");
    expect(slot("combobox-content")?.hasAttribute("data-empty")).toBe(true);
    const rules = rulesFor(empty.className);
    expect(rules).toContain("display: none");
    expect(rules).toContain("group\\/combobox-content");
  });

  test("the content says where it is, and the rules read it", async () => {
    render(() => <Parts align="end" />);
    await user.click(slot("combobox-trigger") as HTMLElement);
    await opened();

    const content = slot("combobox-content") as HTMLElement;
    expect(content.getAttribute("data-state")).toBe("open");
    expect(content.getAttribute("data-side")).toBe("bottom");
    expect(content.getAttribute("data-align")).toBe("end");
    expect(content.getAttribute("data-chips")).toBe("false");
    const rules = rulesFor(content.className);
    expect(rules).toContain('[data-side="bottom"]');
    expect(rules).toContain("width: var(--barq-trigger-width");
  });

  test("showClear adds a clear button once there is a value, and hides the toggle behind it", async () => {
    const chosen: (string | null)[] = [];
    render(() => (
      <Parts showClear defaultValue="Astro" onValueChange={(value) => chosen.push(value)} />
    ));
    const clear = slot("combobox-clear") as HTMLElement;
    expect(clear.tagName.toLowerCase()).toBe("button");
    expect(clear.textContent).toContain("Clear");
    expect(rulesFor(slot("combobox-trigger")?.className ?? "")).toContain(
      ':has([data-slot="combobox-clear"])',
    );

    await user.click(clear);
    await opened();
    expect(chosen).toEqual([null]);
    expect(field().value).toBe("");
    expect(slot("combobox-clear")).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  test("has no ARIA violations, closed, open and empty", async () => {
    const { container } = render(() => <Parts showClear defaultValue="Astro" />);
    expectNoAriaViolations(container);

    await user.click(slot("combobox-trigger") as HTMLElement);
    await opened();
    expectNoAriaViolations(document.body);

    await user.type(field(), "zzz");
    await opened();
    expectNoAriaViolations(document.body);
  });

  test("showTrigger can turn the toggle off", () => {
    render(() => <Parts showTrigger={false} />);
    expect(slot("combobox-trigger")).toBeNull();
    expect(slot("combobox-clear")).toBeNull();
  });

  test("an addon written inside the input lands in its group", () => {
    render(() => (
      <Combobox items={NAMES}>
        <ComboboxInput aria-label="Framework">
          <InputGroupAddon>
            <span data-testid="globe">g</span>
          </InputGroupAddon>
        </ComboboxInput>
      </Combobox>
    ));
    expect(screen.getByTestId("globe").closest('[data-slot="input-group"]')).toBe(
      field().closest('[data-slot="input-group"]'),
    );
  });

  test("the rules are written against the inline edges, so a right-to-left page mirrors", async () => {
    render(() => <Parts defaultValue="Remix" />);
    await user.click(slot("combobox-trigger") as HTMLElement);
    await opened();

    const item = rulesFor(slot("combobox-item")?.className ?? "");
    expect(item).toContain("padding-inline-end");
    expect(item).not.toContain("padding-right");
    expect(item).not.toContain("padding-left");
    const mark = rulesFor(slot("combobox-item-indicator")?.className ?? "");
    expect(mark).toContain("inset-inline-end");
    expect(mark).not.toContain("right:");
  });
});

describe("a Combobox whose trigger is a button", () => {
  const COUNTRIES = [
    { code: "eg", label: "Egypt" },
    { code: "jp", label: "Japan" },
  ];

  function Picker() {
    return (
      <Combobox
        items={COUNTRIES}
        defaultValue={COUNTRIES[0]}
        itemToStringValue={(country: (typeof COUNTRIES)[number]) => country.code}
      >
        <ComboboxTrigger aria-label="Country">
          <ComboboxValue placeholder="Pick a country" />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput showTrigger={false} aria-label="Search" placeholder="Search" />
          <ComboboxList>
            {(country: (typeof COUNTRIES)[number]) => (
              <ComboboxItem value={country}>{country.label}</ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    );
  }

  test("the trigger is the button itself and shows what is chosen", () => {
    render(() => <Picker />);
    const trigger = slot("combobox-trigger") as HTMLElement;
    expect(trigger.tagName.toLowerCase()).toBe("button");
    expect(trigger.getAttribute("data-variant")).toBe("outline");
    expect(trigger.textContent).toContain("Egypt");
    expect(trigger.getAttribute("data-state")).toBe("closed");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  test("the search input is inside the content, and takes the keyboard when it opens", async () => {
    render(() => <Picker />);
    await user.click(slot("combobox-trigger") as HTMLElement);
    await opened();

    expect(field().closest('[data-slot="combobox-content"]')).not.toBeNull();
    expect(document.activeElement).toBe(field());
    expect(slot("combobox-trigger")?.getAttribute("data-state")).toBe("open");

    await user.type(field(), "ja");
    await opened();
    await user.keyboard("{ArrowDown}{Enter}");
    await opened();
    expect(slot("combobox-content")).toBeNull();
    expect(slot("combobox-trigger")?.textContent).toContain("Japan");
  });
});

describe("a Combobox of chips", () => {
  function Chips(props: Incoming<{ onValueChange?: (value: string[]) => void }>) {
    const anchor = useComboboxAnchor();
    return (
      <Combobox
        multiple
        items={NAMES}
        defaultValue={["Remix", "Astro"]}
        onValueChange={(value) => props.onValueChange?.()?.(value as string[])}
      >
        <ComboboxChips ref={anchor} aria-label="Chosen frameworks">
          <ComboboxValue>
            {(values: string[]) => (
              <>
                <For each={values}>{(value: string) => <ComboboxChip>{value}</ComboboxChip>}</For>
                <ComboboxChipsInput aria-label="Frameworks" />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No items found.</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => <ComboboxItem value={item}>{item}</ComboboxItem>}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    );
  }

  function chipNames(): string[] {
    return [...document.querySelectorAll('[data-slot="combobox-chip"]')].map(
      (chip) => chip.firstChild?.textContent ?? "",
    );
  }

  test("each value is a chip with a named remove button, beside the input", async () => {
    render(() => <Chips />);
    await opened();

    expect(slot("combobox-chips")?.tagName.toLowerCase()).toBe("div");
    expect(chipNames()).toEqual(["Remix", "Astro"]);
    expect(field().getAttribute("data-slot")).toBe("combobox-chip-input");
    const removes = [...document.querySelectorAll('[data-slot="combobox-chip-remove"]')];
    expect(removes.map((remove) => remove.textContent)).toEqual(["Remove Remix", "Remove Astro"]);
    expect(removes.every((remove) => remove.getAttribute("tabindex") === "-1")).toBe(true);
  });

  test("a remove button takes its own chip off", async () => {
    const seen: string[][] = [];
    render(() => <Chips onValueChange={(value) => seen.push(value)} />);
    await opened();

    await user.click(screen.getByRole("button", { name: "Remove Remix" }));
    await opened();
    expect(seen).toEqual([["Astro"]]);
    expect(chipNames()).toEqual(["Astro"]);
  });

  test("Backspace in the empty input takes the last chip off", async () => {
    const seen: string[][] = [];
    render(() => <Chips onValueChange={(value) => seen.push(value)} />);
    await opened();
    field().focus();

    await user.keyboard("{Backspace}");
    await opened();
    expect(seen).toEqual([["Remix"]]);
  });

  test("choosing adds a chip, and the list stays open under the chips box", async () => {
    const seen: string[][] = [];
    render(() => <Chips onValueChange={(value) => seen.push(value)} />);
    field().focus();
    await user.type(field(), "sv");
    await opened();

    const content = slot("combobox-content") as HTMLElement;
    expect(content.getAttribute("data-chips")).toBe("true");
    await user.click(screen.getByRole("option", { name: "SvelteKit" }));
    await opened();
    expect(seen).toEqual([["Remix", "Astro", "SvelteKit"]]);
    expect(chipNames()).toEqual(["Remix", "Astro", "SvelteKit"]);
    expect(slot("combobox-content")).not.toBeNull();
    expect(field().value).toBe("");
  });

  test("has no ARIA violations, with chips and an open list", async () => {
    render(() => <Chips />);
    field().focus();
    await user.keyboard("{ArrowDown}");
    await opened();
    expectNoAriaViolations(document.body);
  });

  test("the anchor holds the chips box, which is what the content hangs off", async () => {
    const anchor = useComboboxAnchor();
    render(() => (
      <Combobox multiple items={NAMES}>
        <ComboboxChips ref={anchor}>
          <ComboboxChipsInput aria-label="Frameworks" />
        </ComboboxChips>
      </Combobox>
    ));
    await opened();
    expect(anchor.current).toBe(slot("combobox-chips") as HTMLDivElement);
  });

  test("a chip can go without its remove button", async () => {
    render(() => (
      <Combobox multiple items={NAMES} defaultValue={["Remix"]}>
        <ComboboxChips>
          <ComboboxValue>
            {(values: string[]) => (
              <>
                <For each={values}>
                  {(value: string) => <ComboboxChip showRemove={false}>{value}</ComboboxChip>}
                </For>
                <ComboboxChipsInput aria-label="Frameworks" />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
      </Combobox>
    ));
    await opened();
    expect(slot("combobox-chip")).not.toBeNull();
    expect(slot("combobox-chip-remove")).toBeNull();
  });

  test("the chip's rules are written against the inline edges", async () => {
    render(() => <Chips />);
    await opened();
    const chip = rulesFor(slot("combobox-chip")?.className ?? "");
    expect(chip).toContain("padding-inline-end");
    expect(chip).not.toContain("padding-right");
    const remove = rulesFor(slot("combobox-chip-remove")?.className ?? "");
    expect(remove).toContain("margin-inline-start");
    expect(remove).not.toContain("margin-left");
  });
});

describe("a Combobox written as parts, in groups", () => {
  const ZONES = [
    { value: "Americas", items: ["New York", "Chicago"] },
    { value: "Asia", items: ["Tokyo"] },
  ];

  function Zones() {
    return (
      <Combobox items={ZONES}>
        <ComboboxInput aria-label="Timezone" showClear />
        <ComboboxContent>
          <ComboboxList>
            {(group: (typeof ZONES)[number], index: number) => (
              <ComboboxGroup items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(item: string) => <ComboboxItem value={item}>{item}</ComboboxItem>}
                </ComboboxCollection>
                {index < ZONES.length - 1 ? <ComboboxSeparator /> : null}
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    );
  }

  test("a group is named by its label, and the separator sits between the two", async () => {
    render(() => <Zones />);
    field().focus();
    await user.keyboard("{ArrowDown}");
    await opened();

    const groups = screen.getAllByRole("group").filter((group) => group.tagName === "UL");
    expect(groups).toHaveLength(2);
    expect(
      groups.map(
        (group) =>
          document.getElementById(group.getAttribute("aria-labelledby") ?? "")?.textContent,
      ),
    ).toEqual(["Americas", "Asia"]);
    expect(document.querySelectorAll('[data-slot="combobox-group"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="combobox-label"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="combobox-separator"]')).toHaveLength(1);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "New York",
      "Chicago",
      "Tokyo",
    ]);
  });

  test("grouped, it has no ARIA violations", async () => {
    render(() => <Zones />);
    field().focus();
    await user.keyboard("{ArrowDown}");
    await opened();
    expectNoAriaViolations(document.body);
  });

  test("the clear button can also be written on its own", () => {
    render(() => (
      <Combobox items={NAMES} defaultValue="Astro">
        <ComboboxInput aria-label="Framework" showTrigger={false} />
        <ComboboxClear clearLabel="Reset" />
      </Combobox>
    ));
    expect(slot("combobox-clear")?.textContent).toContain("Reset");
  });
});
