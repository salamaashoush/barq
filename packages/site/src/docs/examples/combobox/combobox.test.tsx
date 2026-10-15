import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import ComboboxClearExample from "./combobox-clear.tsx";
import ComboboxDemo from "./combobox-demo.tsx";
import ComboboxDisabled from "./combobox-disabled.tsx";
import ComboboxGroups from "./combobox-groups.tsx";
import ComboboxMultiple from "./combobox-multiple.tsx";
import ComboboxPopup from "./combobox-popup.tsx";
import ComboboxRtl from "./combobox-rtl.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const options = (): string[] =>
  screen
    .getAllByRole("option")
    .filter((option) => !option.closest("[hidden]"))
    .map((option) => option.textContent ?? "");

describe("the combobox examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("combobox")).toEqual([]);
  });

  test("typing filters the frameworks and a press picks one", async () => {
    render(() => <ComboboxDemo />);
    const input = screen.getByRole<HTMLInputElement>("combobox", { name: "Framework" });
    await user.click(input);
    await settle();
    expect(options()).toEqual(["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"]);

    await user.type(input, "ux");
    await settle();
    expect(options()).toEqual(["Nuxt.js"]);

    await user.click(screen.getByRole("option", { name: "Nuxt.js" }));
    await settle();
    expect(input.value).toBe("Nuxt.js");
  });

  test("the clear button empties a field that starts with a value", async () => {
    render(() => <ComboboxClearExample />);
    const input = screen.getByRole<HTMLInputElement>("combobox", { name: "Framework" });
    expect(input.value).toBe("Next.js");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await settle();
    expect(input.value).toBe("");
  });

  test("a disabled combobox cannot be typed in", () => {
    render(() => <ComboboxDisabled />);
    expect(screen.getByRole<HTMLInputElement>("combobox", { name: "Framework" }).disabled).toBe(
      true,
    );
  });

  test("the groups carry their labels", async () => {
    render(() => <ComboboxGroups />);
    await user.click(screen.getByRole("combobox", { name: "Timezone" }));
    await settle();
    const listbox = screen.getByRole("listbox");
    expect(
      [...listbox.querySelectorAll('[data-slot="combobox-label"]')].map(
        (label) => label.textContent,
      ),
    ).toEqual(["Americas", "Europe", "Asia/Pacific"]);
    expect(options()).toHaveLength(18);
    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });

  test("a chip is added for each choice and starts with the first", async () => {
    render(() => <ComboboxMultiple />);
    const chips = (): string[] =>
      [...document.querySelectorAll('[data-slot="combobox-chip"]')].map(
        (chip) => chip.firstChild?.textContent ?? "",
      );
    expect(chips()).toEqual(["Next.js"]);
    await user.click(screen.getByRole("combobox", { name: "Frameworks" }));
    await settle();
    await user.click(screen.getByRole("option", { name: "Remix" }));
    await settle();
    expect(chips()).toEqual(["Next.js", "Remix"]);
  });

  test("the trigger shows the chosen country and the search sits in the panel", async () => {
    render(() => <ComboboxPopup />);
    const trigger = screen.getByRole("button", { name: "Country" });
    expect(trigger.textContent).toContain("Select country");
    await user.click(trigger);
    await settle();
    await user.click(screen.getByRole("option", { name: "Egypt" }));
    await settle();
    expect(trigger.textContent).toContain("Egypt");
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <ComboboxRtl />);
    expect(
      document.querySelector('[dir="rtl"] [data-slot="combobox-chip"]')?.textContent,
    ).toContain("التكنولوجيا");
  });
});
