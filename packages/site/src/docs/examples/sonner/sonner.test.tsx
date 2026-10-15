import { afterEach, describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";
import { Toaster, toast } from "@barqjs/ui";

import { hydrateExamples } from "../test-harness.ts";
import SonnerDemo from "./sonner-demo.tsx";
import SonnerPosition from "./sonner-position.tsx";
import SonnerTypes from "./sonner-types.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const toasts = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-slot="toast"]'),
];

describe("the sonner examples", () => {
  afterEach(() => {
    toast.dismiss();
  });

  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("sonner")).toEqual([]);
  });

  test("the button raises a toast with its description and action", async () => {
    render(() => (
      <>
        <Toaster />
        <SonnerDemo />
      </>
    ));
    await user.click(screen.getByRole("button", { name: "Show Toast" }));
    await settle();
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]?.textContent).toContain("Event has been created");
    expect(toasts()[0]?.textContent).toContain("Sunday, December 03, 2023 at 9:00 AM");
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  test("each type marks its toast", async () => {
    render(() => (
      <>
        <Toaster />
        <SonnerTypes />
      </>
    ));
    await user.click(screen.getByRole("button", { name: "Warning" }));
    await settle();
    expect(toasts()[0]?.getAttribute("data-type")).toBe("warning");
  });

  test("a toast lands where its position says", async () => {
    render(() => (
      <>
        <Toaster />
        <SonnerPosition />
      </>
    ));
    await user.click(screen.getByRole("button", { name: "Top Left" }));
    await settle();
    expect(
      document.querySelector('[data-y-position="top"][data-x-position="left"]'),
    ).not.toBeNull();
  });
});
