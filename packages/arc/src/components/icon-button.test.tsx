import { describe, expect, test } from "bun:test";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { IconButton } from "./icon-button.tsx";

const icon = <svg aria-hidden="true" />;

describe("IconButton", () => {
  test("is named by its label, and shows it as a tooltip on keyboard focus", async () => {
    let pressed = 0;
    render(() => (
      <IconButton label="Delete" shortcut="⌘⌫" onPress={() => pressed++}>
        {icon}
      </IconButton>
    ));
    const button = screen.getByRole("button", { name: "Delete" });
    user.tab();
    expect(document.activeElement).toBe(button);
    await settle();
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe("Delete⌘⌫"));
    await user.keyboard("{Enter}");
    expect(pressed).toBe(1);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a tap presses it, and a toggle says it is pressed", async () => {
    let pressed = 0;
    render(() => (
      <IconButton label="Bold" isPressed onPress={() => pressed++}>
        {icon}
      </IconButton>
    ));
    const button = screen.getByRole("button", { name: "Bold" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    user.tap(button);
    expect(pressed).toBe(1);
  });

  test("takes a class on its parts and a slot", async () => {
    render(() => (
      <IconButton
        label="Search"
        shortcut="/"
        class="mine"
        classes={{ tooltip: "t", shortcut: "s" }}
      >
        {icon}
      </IconButton>
    ));
    const button = screen.getByRole("button", { name: "Search" });
    expect(button.classList.contains("mine")).toBe(true);
    expect(button.getAttribute("data-slot")).toBe("icon-button");
    user.tab();
    await settle();
    await waitFor(() => expect(screen.getByRole("tooltip").classList.contains("t")).toBe(true));
    expect(
      document.querySelector('[data-slot="icon-button-shortcut"]')?.classList.contains("s"),
    ).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { IconButton } from "<arc>";
      export function Page() {
        return <IconButton label="Bold"><svg /></IconButton>;
      }
    `);
    expect(result.container.querySelector('[aria-label="Bold"]')).not.toBeNull();
    result.unmount();
  });
});
