import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import TabsDemo from "./tabs-demo.tsx";
import TabsDisabled from "./tabs-disabled.tsx";
import TabsIcons from "./tabs-icons.tsx";
import TabsItems from "./tabs-items.tsx";
import TabsLine from "./tabs-line.tsx";
import TabsRtl from "./tabs-rtl.tsx";
import TabsVertical from "./tabs-vertical.tsx";

const selected = (name: string): string | null =>
  screen.getByRole("tab", { name }).getAttribute("aria-selected");

describe("the tabs examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("tabs")).toEqual([]);
  });

  test("pressing a tab swaps the one panel that is shown", async () => {
    render(() => <TabsDemo />);
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(selected("Overview")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("12 active projects");

    await user.click(screen.getByRole("tab", { name: "Reports" }));
    flush();
    expect(selected("Reports")).toBe("true");
    expect(selected("Overview")).toBe("false");
    expect(screen.getByRole("tabpanel").textContent).toContain("5 reports ready");
  });

  test("the line variant is written on the list", () => {
    render(() => <TabsLine />);
    expect(screen.getByRole("tablist").getAttribute("data-variant")).toBe("line");
    expect(selected("Overview")).toBe("true");
  });

  test("vertical tabs move with the down arrow", () => {
    render(() => <TabsVertical />);
    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical");

    user.focus(screen.getByRole("tab", { name: "Account" }));
    user.keyDown("ArrowDown");
    flush();
    expect(selected("Password")).toBe("true");
  });

  test("a disabled tab is not selected by a press", async () => {
    render(() => <TabsDisabled />);
    const disabled = screen.getByRole("tab", { name: "Disabled" });
    expect(disabled.getAttribute("aria-disabled")).toBe("true");

    await user.click(disabled);
    flush();
    expect(selected("Disabled")).toBe("false");
    expect(selected("Home")).toBe("true");
  });

  test("each tab holds an icon before its label", () => {
    render(() => <TabsIcons />);
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    }
  });

  test("tabs built from items show the panel of the pressed tab", async () => {
    render(() => <TabsItems />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Account",
      "Password",
      "Team",
    ]);
    expect(screen.getByRole("tabpanel").textContent).toContain("Change your name");

    await user.click(screen.getByRole("tab", { name: "Team" }));
    flush();
    expect(screen.getByRole("tabpanel").textContent).toContain("Invite people");
  });

  test("right to left, the left arrow moves to the next tab", () => {
    render(() => <TabsRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="tabs"]')).not.toBeNull();

    user.focus(screen.getByRole("tab", { name: "نظرة عامة" }));
    user.keyDown("ArrowLeft");
    flush();
    expect(selected("التحليلات")).toBe("true");
  });
});
