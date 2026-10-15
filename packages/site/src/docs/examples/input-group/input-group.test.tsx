import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import InputGroupBlockStart from "./input-group-block-start.tsx";
import InputGroupButtonExample from "./input-group-button.tsx";
import InputGroupCustom from "./input-group-custom.tsx";
import InputGroupDemo from "./input-group-demo.tsx";
import InputGroupDropdown from "./input-group-dropdown.tsx";
import InputGroupLabel from "./input-group-label.tsx";
import InputGroupRtl from "./input-group-rtl.tsx";
import InputGroupWithKbd from "./input-group-with-kbd.tsx";
import InputGroupWithTooltip from "./input-group-with-tooltip.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the input group examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("input-group")).toEqual([]);
  });

  test("the first example is one group around a control and two addons", () => {
    render(() => <InputGroupDemo />);
    const group = document.querySelector('[data-slot="input-group"]');
    expect(group?.querySelector('[data-slot="input-group-control"]')).toBe(
      screen.getByRole("textbox", { name: "Search" }),
    );
    expect(
      [...(group?.querySelectorAll('[data-slot="input-group-addon"]') ?? [])].map((addon) =>
        addon.getAttribute("data-align"),
      ),
    ).toEqual(["inline-start", "inline-end"]);
  });

  test("a block addon sits on its own row and its label names the control", () => {
    render(() => <InputGroupBlockStart />);
    expect(
      [...document.querySelectorAll('[data-slot="input-group-addon"]')].map((addon) =>
        addon.getAttribute("data-align"),
      ),
    ).toEqual(["block-start", "block-start"]);
    expect(screen.getByLabelText("Textarea").tagName).toBe("TEXTAREA");
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  test("the favorite button turns over and the popover opens from the group", async () => {
    render(() => <InputGroupButtonExample />);
    const favorite = screen.getByRole("button", { name: "Favorite" });
    expect(favorite.getAttribute("aria-pressed")).toBe("false");
    await user.click(favorite);
    await settle();
    expect(favorite.getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Connection details" }));
    await settle();
    expect(screen.getByText("Your connection is not secure.")).toBeTruthy();
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByText("Your connection is not secure.")).toBeNull();
  });

  test("a button inside the group opens a menu", async () => {
    render(() => <InputGroupDropdown />);
    await user.click(screen.getByRole("button", { name: "More" }));
    await settle();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Settings",
      "Copy path",
      "Open location",
    ]);
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("a custom control wearing the control slot is the group's control", () => {
    render(() => <InputGroupCustom />);
    const control = screen.getByRole("textbox", { name: "Message" });
    expect(control.tagName).toBe("TEXTAREA");
    expect(control.getAttribute("data-slot")).toBe("input-group-control");
    expect(control.closest('[data-slot="input-group"]')).not.toBeNull();
  });

  test("a label inside an addon names the control", () => {
    render(() => <InputGroupLabel />);
    expect(screen.getByLabelText("@").getAttribute("placeholder")).toBe("salama");
    expect(screen.getByLabelText("Email").getAttribute("placeholder")).toBe("salama@example.com");
  });

  test("a disabled group says so and its control is disabled", () => {
    render(() => <InputGroupWithKbd />);
    const control = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Search documentation, disabled",
    });
    expect(control.disabled).toBe(true);
    expect(control.closest('[data-slot="input-group"]')?.hasAttribute("data-disabled")).toBe(true);
  });

  test("the country code picked from the menu is the button's text", async () => {
    render(() => <InputGroupWithTooltip />);
    const trigger = screen.getByRole("button", { name: "Country code" });
    expect(trigger.textContent).toContain("+1");
    await user.click(trigger);
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "+44" }));
    await settle();
    expect(trigger.textContent).toContain("+44");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <InputGroupRtl />);
    expect(document.querySelectorAll('[dir="rtl"] [data-slot="input-group"]')).toHaveLength(4);
    expect(screen.getByLabelText("منطقة النص").tagName).toBe("TEXTAREA");
  });
});
