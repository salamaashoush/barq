import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import AvatarBadgeIconExample from "./avatar-badge-icon.tsx";
import AvatarDemo from "./avatar-demo.tsx";
import AvatarDropdown from "./avatar-dropdown.tsx";
import AvatarGroupCountIconExample from "./avatar-group-count-icon.tsx";
import AvatarRtl from "./avatar-rtl.tsx";
import AvatarSizeExample from "./avatar-size.tsx";

const slots = (name: string): readonly Element[] => [
  ...document.querySelectorAll(`[data-slot="${name}"]`),
];

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the avatar examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("avatar")).toEqual([]);
  });

  test("the first example shows a lone avatar, one with a badge, and a counted group", () => {
    render(() => <AvatarDemo />);
    expect(slots("avatar")).toHaveLength(5);
    expect(slots("avatar-badge")).toHaveLength(1);
    const group = slots("avatar-group")[0];
    expect(group?.querySelectorAll('[data-slot="avatar"]')).toHaveLength(3);
    expect(group?.lastElementChild?.textContent).toBe("+3");
  });

  test("the badge and the group count each hold an icon", () => {
    render(() => <AvatarBadgeIconExample />);
    expect(slots("avatar-badge")[0]?.firstElementChild?.tagName.toLowerCase()).toBe("svg");

    render(() => <AvatarGroupCountIconExample />);
    expect(slots("avatar-group-count")[0]?.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  });

  test("the sizes are written as attributes, small to large", () => {
    render(() => <AvatarSizeExample />);
    expect(slots("avatar").map((avatar) => avatar.getAttribute("data-size"))).toEqual([
      "sm",
      "default",
      "lg",
    ]);
  });

  test("the avatar button opens a menu of four items and Escape closes it", async () => {
    render(() => <AvatarDropdown />);
    const trigger = screen.getByRole("button", { name: "salama" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.querySelector('[data-slot="avatar"]')).not.toBeNull();

    await user.click(trigger);
    await settle();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Profile",
      "Billing",
      "Settings",
      "Log out",
    ]);
    expect(screen.getByRole("menuitem", { name: "Log out" }).getAttribute("data-variant")).toBe(
      "destructive",
    );

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <AvatarRtl />);
    expect(document.querySelectorAll('[dir="rtl"] [data-slot="avatar"]')).toHaveLength(5);
    expect(slots("avatar-group-count")[0]?.textContent).toBe("+٣");
  });
});
