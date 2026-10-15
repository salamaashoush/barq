import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { Dashboard01 } from "./dashboard-01.tsx";
import { hydrateBlock } from "./test-harness.ts";

const sidebar = (root: ParentNode): HTMLElement =>
  root.querySelector('[data-slot="sidebar"]') as HTMLElement;

describe("dashboard-01", () => {
  test("the four stat cards, the chart and the table are all on the page", () => {
    render(() => <Dashboard01 />);
    for (const stat of ["Total Revenue", "New Customers", "Active Accounts", "Growth Rate"]) {
      expect(screen.getByText(stat)).not.toBeNull();
    }
    expect(document.querySelector('[data-slot="chart"]')).not.toBeNull();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(8);
  });

  test("the trigger collapses the sidebar to its icons", async () => {
    render(() => <Dashboard01 />);
    expect(sidebar(document).getAttribute("data-state")).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(sidebar(document).getAttribute("data-state")).toBe("collapsed");
    expect(sidebar(document).getAttribute("data-collapsible")).toBe("icon");
  });

  test("the pager moves, and stops at the first page", async () => {
    render(() => <Dashboard01 />);
    const previous = screen.getByRole("button", { name: "Previous page" });
    expect(previous.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    flush();
    expect(screen.getByText("Page 2 of 5")).not.toBeNull();
    expect(previous.hasAttribute("disabled")).toBe(false);
  });

  test("every checkbox in the table says which row it selects", () => {
    render(() => <Dashboard01 />);
    expect(screen.getByRole("checkbox", { name: "Select all" })).not.toBeNull();
    expect(screen.getByRole("checkbox", { name: "Select Cover page" })).not.toBeNull();
  });

  test("the server's markup is claimed, and only the chart draws itself again", async () => {
    const result = await hydrateBlock("dashboard-01.tsx", "Dashboard01");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);

    // The chart mounts its own surface once it can measure its container, so
    // the marks the server drew are replaced. Nothing outside it may be.
    const written = document.createElement("div");
    written.innerHTML = result.html;
    const drawn = written.querySelectorAll('[data-slot="chart"] *').length;
    expect(result.total - result.kept).toBeLessThanOrEqual(drawn);

    await user.click(
      result.container.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement,
    );
    flush();
    expect(sidebar(result.container).getAttribute("data-state")).toBe("collapsed");
    result.unmount();
  });
});
