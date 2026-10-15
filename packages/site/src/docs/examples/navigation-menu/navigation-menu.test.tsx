import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import NavigationMenuDemo from "./navigation-menu-demo.tsx";
import NavigationMenuRtl from "./navigation-menu-rtl.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the navigation menu examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("navigation-menu")).toEqual([]);
  });

  test("a trigger opens its panel of links and the plain link is a link", async () => {
    render(() => <NavigationMenuDemo />);
    expect(screen.getByRole("link", { name: "Docs" }).getAttribute("href")).toBe(
      "/docs/components",
    );
    const trigger = screen.getByRole("button", { name: "Components" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    await settle();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const link = screen.getByRole("link", { name: /Hover Card/ });
    expect(link.getAttribute("href")).toBe("/docs/components/hover-card");
    expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(7);
  });

  test("the right-to-left menu names its direction", async () => {
    render(() => <NavigationMenuRtl />);
    await user.click(screen.getByRole("button", { name: "البدء" }));
    await settle();
    expect(screen.getByRole("link", { name: /التثبيت/ }).closest('[dir="rtl"]')).not.toBeNull();
  });
});
