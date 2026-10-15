import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import ToastDemo from "./toast-demo.tsx";
import ToastTypes from "./toast-types.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const toasts = (): Element[] => [...document.querySelectorAll('[data-slot="toast"]')];

describe("the toast examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("toast")).toEqual([]);
  });

  test("the button adds a toast with a title, a description and an action that closes it", async () => {
    render(() => <ToastDemo />);
    expect(toasts()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Show Toast" }));
    await settle();
    expect(toasts()).toHaveLength(1);
    expect(document.querySelector('[data-slot="toast-title"]')?.textContent).toBe("Event created");
    expect(document.querySelector('[data-slot="toast-description"]')?.textContent).toBe(
      "Sunday, December 3 at 9:00 AM",
    );

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(toasts().filter((toast) => !toast.hasAttribute("data-ending-style"))).toHaveLength(0);
  });

  test("a typed toast says its type", async () => {
    render(() => <ToastTypes />);
    await user.click(screen.getByRole("button", { name: "Success" }));
    await settle();
    expect(toasts().map((toast) => toast.getAttribute("data-type"))).toEqual(["success"]);
  });
});
