import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { render, screen, user } from "@barqjs/testing";

import { Combobox } from "./combobox.tsx";

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
    const rules = content.className
      .split(" ")
      .map((name) => {
        const mentions = new RegExp(`\\.${name}(?![\\w-])`);
        return collectCss()
          .split("@layer barq.ui{")
          .filter((chunk) => mentions.test(chunk))
          .join("");
      })
      .join("");
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
