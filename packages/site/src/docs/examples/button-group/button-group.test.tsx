import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import ButtonGroupDemo from "./button-group-demo.tsx";
import ButtonGroupDropdown from "./button-group-dropdown.tsx";
import ButtonGroupInputGroup from "./button-group-input-group.tsx";
import ButtonGroupInput from "./button-group-input.tsx";
import ButtonGroupNested from "./button-group-nested.tsx";
import ButtonGroupOrientation from "./button-group-orientation.tsx";
import ButtonGroupPopover from "./button-group-popover.tsx";
import ButtonGroupRtl from "./button-group-rtl.tsx";
import ButtonGroupSelect from "./button-group-select.tsx";
import ButtonGroupSeparator from "./button-group-separator.tsx";
import ButtonGroupWithText from "./button-group-with-text.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const checked = (name: string): string | null =>
  screen.getByRole("menuitemradio", { name }).getAttribute("aria-checked");

describe("the button group examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("button-group")).toEqual([]);
  });

  test("the menu's submenu holds the label, and choosing one moves the radio", async () => {
    render(() => <ButtonGroupDemo />);
    const more = screen.getByRole("button", { name: "More Options" });

    more.focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(screen.getAllByRole("menuitem")).toHaveLength(7);

    await user.keyboard("{End}{ArrowUp}{ArrowRight}");
    await settle();
    expect(checked("Personal")).toBe("true");
    expect(checked("Work")).toBe("false");

    await user.click(screen.getByRole("menuitemradio", { name: "Work" }));
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();

    more.focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    await user.keyboard("{End}{ArrowUp}{ArrowRight}");
    await settle();
    expect(checked("Work")).toBe("true");
    expect(checked("Personal")).toBe("false");

    await user.click(screen.getByRole("menuitemradio", { name: "Work" }));
    await settle();
    expect(screen.queryAllByRole("menu")).toHaveLength(0);
  });

  test("a vertical group says so, and names itself", () => {
    render(() => <ButtonGroupOrientation />);
    const group = screen.getByRole("group", { name: "Media controls" });
    expect(group.getAttribute("data-orientation")).toBe("vertical");
    expect(group.querySelectorAll('[data-slot="button"]')).toHaveLength(2);
  });

  test("the separator between two buttons is vertical", () => {
    render(() => <ButtonGroupSeparator />);
    const rule = document.querySelector('[data-slot="button-group-separator"]');
    expect(rule?.getAttribute("data-orientation")).toBe("vertical");
    expect(rule?.previousElementSibling?.textContent).toBe("Copy");
    expect(rule?.nextElementSibling?.textContent).toBe("Paste");
  });

  test("an input in a group takes what is typed", async () => {
    render(() => <ButtonGroupInput />);
    const input = screen.getByRole("textbox", { name: "Search query" }) as HTMLInputElement;
    await user.type(input, "barq");
    expect(input.value).toBe("barq");
    expect(input.parentElement?.getAttribute("data-slot")).toBe("button-group");
  });

  test("the nested group's icon is described by its tooltip", async () => {
    render(() => <ButtonGroupNested />);
    const icon = document.querySelector<HTMLElement>('[data-slot="tooltip-trigger"]');
    expect(icon).not.toBeNull();
    expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull();

    user.hover(icon as HTMLElement);
    await settle();
    const tip = document.querySelector('[data-slot="tooltip-content"]');
    expect(tip?.textContent).toBe("Voice Mode");
    expect(icon?.getAttribute("aria-describedby")).toBe(tip?.getAttribute("id") ?? "");

    user.unhover(icon as HTMLElement);
    await settle();
  });

  test("voice mode is a pressed button that disables the message", async () => {
    render(() => <ButtonGroupInputGroup />);
    const voice = screen.getByRole("button", { name: "Voice Mode" });
    const message = screen.getByRole("textbox", { name: "Message" }) as HTMLInputElement;
    expect(voice.getAttribute("aria-pressed")).toBe("false");
    expect(message.placeholder).toBe("Send a message...");

    await user.click(voice);
    await settle();
    expect(voice.getAttribute("aria-pressed")).toBe("true");
    expect(message.disabled).toBe(true);
    expect(message.placeholder).toBe("Record and send audio...");

    await user.click(voice);
    await settle();
    expect(voice.getAttribute("aria-pressed")).toBe("false");
    expect(message.disabled).toBe(false);
  });

  test("the split button's menu lists the conversation actions", async () => {
    render(() => <ButtonGroupDropdown />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await settle();
    expect(screen.getAllByRole("menuitem")).toHaveLength(7);
    expect(
      screen.getByRole("menuitem", { name: "Delete Conversation" }).getAttribute("data-variant"),
    ).toBe("destructive");

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("choosing a currency puts its sign on the trigger", async () => {
    render(() => <ButtonGroupSelect />);
    await settle();
    const trigger = screen.getByRole("combobox", { name: "Currency" });
    expect(trigger.textContent).toBe("$");

    user.click(trigger);
    await settle();
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "$ US Dollar",
      "€ Euro",
      "£ British Pound",
    ]);

    await user.click(options[1] as HTMLElement);
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Currency" }).textContent).toBe("€");
  });

  test("the popover holds a labelled task field and closes on Escape", async () => {
    render(() => <ButtonGroupPopover />);
    await user.click(screen.getByRole("button", { name: "Open Popover" }));
    await settle();
    expect(document.querySelector('[data-slot="popover-title"]')?.textContent).toBe(
      "Start a new task with Copilot",
    );
    const task = screen.getByRole("textbox", { name: "Task Description" });
    expect(task.tagName).toBe("TEXTAREA");

    await user.keyboard("{Escape}");
    await settle();
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  });

  test("text in a group is a slot of its own beside the button", () => {
    render(() => <ButtonGroupWithText />);
    const text = document.querySelector('[data-slot="button-group-text"]');
    expect(text?.textContent).toBe("https://");
    expect(text?.nextElementSibling?.getAttribute("data-slot")).toBe("button");
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <ButtonGroupRtl />);
    expect(document.querySelectorAll('[dir="rtl"] [data-slot="button-group"]')).toHaveLength(4);
  });
});
