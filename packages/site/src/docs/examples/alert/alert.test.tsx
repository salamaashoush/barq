import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import AlertActionExample from "./alert-action.tsx";
import AlertDemo from "./alert-demo.tsx";
import AlertDestructive from "./alert-destructive.tsx";
import AlertRtl from "./alert-rtl.tsx";
import AlertTitleOnly from "./alert-title-only.tsx";

describe("the alert examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("alert")).toEqual([]);
  });

  test("each alert announces itself and carries its icon as a direct child", () => {
    render(() => <AlertDemo />);
    const alerts = screen.getAllByRole("alert");
    expect(alerts.map((alert) => alert.firstElementChild?.tagName.toLowerCase())).toEqual([
      "svg",
      "svg",
    ]);
    expect(
      alerts.map((alert) => alert.querySelector('[data-slot="alert-title"]')?.textContent),
    ).toEqual(["Payment successful", "New feature available"]);
  });

  test("the destructive alert names its variant", () => {
    render(() => <AlertDestructive />);
    expect(screen.getByRole("alert").getAttribute("data-variant")).toBe("destructive");
  });

  test("the action is a button inside the alert's action slot", () => {
    render(() => <AlertActionExample />);
    const enable = screen.getByRole("button", { name: "Enable" });
    expect(enable.closest('[data-slot="alert-action"]')).not.toBeNull();
    expect(enable.getAttribute("data-size")).toBe("xs");
  });

  test("an alert with only a title has no description", () => {
    render(() => <AlertTitleOnly />);
    const alert = screen.getByRole("alert");
    expect(alert.querySelector('[data-slot="alert-title"]')?.textContent).toBe(
      "Everything is up to date.",
    );
    expect(alert.querySelector('[data-slot="alert-description"]')).toBeNull();
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <AlertRtl />);
    expect(document.querySelectorAll('[dir="rtl"] [data-slot="alert"]')).toHaveLength(2);
  });
});
