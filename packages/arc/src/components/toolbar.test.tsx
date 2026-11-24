import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import { IconButton } from "./icon-button.tsx";
import { Toolbar, ToolbarSeparator, toolbarStyles } from "./toolbar.tsx";

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

const icon = <svg aria-hidden="true" />;

describe("Toolbar", () => {
  test("one Tab stop, the arrows moving across in the reading direction", async () => {
    render(() => (
      <Rtl>
        <Toolbar aria-label="تنسيق" variant="floating">
          <IconButton label="Bold" tooltip={false}>
            {icon}
          </IconButton>
          <ToolbarSeparator />
          <IconButton label="Italic" tooltip={false}>
            {icon}
          </IconButton>
        </Toolbar>
      </Rtl>
    ));
    const bar = screen.getByRole("toolbar", { name: "تنسيق" });
    expect(bar.getAttribute("data-variant")).toBe("floating");
    user.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Bold");
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Italic");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("docked, it holds to the bottom of a compact screen clear of the home indicator", () => {
    const { root } = toolbarStyles({ variant: "docked" });
    render(() => <Toolbar aria-label="Tools" variant="docked" classes={{ root: "r" }} />);
    const bar = screen.getByRole("toolbar");
    expect(bar.classList.contains("r")).toBe(true);
    for (const one of root.split(" ")) expect(bar.classList.contains(one)).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { IconButton, Toolbar, ToolbarSeparator } from "<arc>";
      export function Page() {
        return (
          <Toolbar aria-label="Tools" variant="floating">
            <IconButton label="Bold"><svg /></IconButton>
            <ToolbarSeparator />
            <IconButton label="Italic"><svg /></IconButton>
          </Toolbar>
        );
      }
    `);
    expect(result.container.querySelector('[role="toolbar"]')?.getAttribute("data-variant")).toBe(
      "floating",
    );
    result.unmount();
  });
});
