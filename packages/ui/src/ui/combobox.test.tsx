import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Combobox, ComboboxLabel, ComboboxSeparator } from "./combobox.tsx";

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
