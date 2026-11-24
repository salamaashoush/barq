import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { Chip, chipVariants } from "./chip.tsx";
import { provideArcMessages } from "./messages.ts";

function chip(): HTMLElement {
  return document.querySelector('[data-slot="chip"]') as HTMLElement;
}

describe("Chip", () => {
  test("a plain chip is its words, with no control", () => {
    render(() => <Chip>Design</Chip>);
    expect(chip().textContent).toBe("Design");
    expect(screen.queryByRole("button")).toBeNull();
    expect(chip().getAttribute("data-tone")).toBe("neutral");
  });

  test("a filter chip is a toggle button that holds its state and shows a check", async () => {
    const changes: boolean[] = [];
    render(() => <Chip onSelectedChange={(on) => changes.push(on)}>Remote</Chip>);
    const button = screen.getByRole("button", { name: "Remote" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(chip().querySelector('[data-slot="chip-check"]')).toBeNull();

    await user.click(button);
    await settle();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(chip().hasAttribute("data-selected")).toBe(true);
    expect(chip().querySelector('[data-slot="chip-check"]')).not.toBeNull();
    expect(changes).toEqual([true]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("follows the caller's selected state", async () => {
    const [on, setOn] = createSignal(true);
    render(() => (
      <Chip selected={on()} onSelectedChange={setOn}>
        Remote
      </Chip>
    ));
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
    setOn(false);
    await settle();
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });

  test("an input chip's remove button is named after it and removes it", async () => {
    const removed: string[] = [];
    render(() => <Chip onRemove={() => removed.push("design")}>Design</Chip>);
    const remove = screen.getByRole("button", { name: "Remove Design" });
    await user.click(remove);
    expect(removed).toEqual(["design"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("works from the keyboard: Space toggles, Enter removes", async () => {
    let selected = false;
    let removed = 0;
    render(() => (
      <Chip onSelectedChange={(on) => (selected = on)} onRemove={() => removed++}>
        Remote
      </Chip>
    ));
    user.tab();
    expect(document.activeElement?.getAttribute("data-slot")).toBe("chip-action");
    await user.keyboard(" ");
    await settle();
    expect(selected).toBe(true);
    user.tab();
    expect(document.activeElement?.getAttribute("data-slot")).toBe("chip-remove");
    await user.keyboard("{Enter}");
    expect(removed).toBe(1);
  });

  test("an action chip is a button; a disabled one does nothing", async () => {
    let pressed = 0;
    render(() => (
      <>
        <Chip onPress={() => pressed++}>Suggest</Chip>
        <Chip onPress={() => pressed++} isDisabled>
          Off
        </Chip>
      </>
    ));
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    await user.click(screen.getByRole("button", { name: "Off" }));
    expect(pressed).toBe(1);
  });

  test("a tap presses it, and each control has room for a finger", async () => {
    let selected = false;
    render(() => (
      <Chip onSelectedChange={(on) => (selected = on)} onRemove={() => {}}>
        Remote
      </Chip>
    ));
    user.tap(screen.getByRole("button", { name: "Remote" }));
    await settle();
    expect(selected).toBe(true);
    expect(wears(chip().querySelector('[data-slot="chip-action"]'), target.size)).toBe(true);
    expect(wears(chip().querySelector('[data-slot="chip-remove"]'), target.size)).toBe(true);
  });

  test("lays out by reading direction: the remove button at the inline end", () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <Chip onRemove={() => {}}>تصميم</Chip>
      </Rtl>
    ));
    const remove = chip().lastElementChild as HTMLElement;
    expect(remove.getAttribute("data-slot")).toBe("chip-remove");
    const sheet = collectCss();
    const atEnd = chipVariants({})
      .remove.split(" ")
      .some((one) => sheet.includes(`.${one}{margin-inline-end:`));
    expect(atEnd).toBe(true);
  });

  test("the remove label comes from arc's words", () => {
    function German(props: ParentProps) {
      provideArcMessages(() => ({ remove: "Entfernen" }));
      return <>{props.children}</>;
    }
    render(() => (
      <German>
        <Chip onRemove={() => {}}>Design</Chip>
      </German>
    ));
    expect(screen.getByRole("button", { name: "Entfernen Design" })).toBeDefined();
  });

  test("takes a class per part, a slot on every part, and its tone and size", () => {
    render(() => (
      <Chip
        class="mine"
        tone="success"
        size="sm"
        variant="subtle"
        icon={<svg />}
        selected
        onRemove={() => {}}
        classes={{
          root: "r",
          action: "a",
          label: "l",
          icon: "i",
          check: "c",
          remove: "x",
        }}
      >
        Passed
      </Chip>
    ));
    const slots = ["chip", "chip-action", "chip-label", "chip-icon", "chip-check", "chip-remove"];
    const classes = ["r", "a", "l", "i", "c", "x"];
    slots.forEach((slot, at) => {
      const element = document.querySelector(`[data-slot="${slot}"]`);
      expect(element?.classList.contains(classes[at] ?? "")).toBe(true);
    });
    expect(chip().classList.contains("mine")).toBe(true);
    expect(chip().getAttribute("data-tone")).toBe("success");
    expect(chip().getAttribute("data-size")).toBe("sm");
    expect(
      wears(
        chip(),
        chipVariants({ tone: "success", variant: "subtle", size: "sm", plain: false }).root,
      ),
    ).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { Chip } from "<arc>";
      export function Page() {
        return (
          <div>
            <Chip>Design</Chip>
            <Chip defaultSelected>Remote</Chip>
            <Chip onRemove={() => {}}>Draft</Chip>
          </div>
        );
      }
    `);
    expect(result.container.querySelector('[aria-pressed="true"]')?.textContent).toBe("Remote");
    expect(result.container.querySelector('[data-slot="chip-remove"]')).not.toBeNull();
    result.unmount();
  });
});
