import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import HoverCardDemo from "./hover-card-demo.tsx";
import HoverCardRtl from "./hover-card-rtl.tsx";
import HoverCardSides from "./hover-card-sides.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const after = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const card = (): HTMLElement | null => document.querySelector('[data-slot="hover-card-content"]');

describe("the hover card examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("hover-card")).toEqual([]);
  });

  test("hovering the link opens the card after its delay", async () => {
    render(() => <HoverCardDemo />);
    user.hover(screen.getByRole("button", { name: "Hover Here" }));
    await after(30);
    await settle();
    expect(card()?.textContent).toContain("@acme");
    expect(card()?.textContent).toContain("Joined December 2021");
  });

  test("each card opens on its own side", async () => {
    render(() => <HoverCardSides />);
    user.hover(screen.getByRole("button", { name: "bottom" }));
    await after(130);
    await settle();
    expect(card()?.getAttribute("data-side")).toBe("bottom");
  });

  test("the right-to-left card names its direction", async () => {
    render(() => <HoverCardRtl />);
    user.hover(screen.getByRole("button", { name: "أعلى" }));
    await after(30);
    await settle();
    expect(card()?.closest('[dir="rtl"]')).not.toBeNull();
  });
});
