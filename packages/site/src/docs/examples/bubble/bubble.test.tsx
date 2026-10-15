import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import BubbleAlignment from "./bubble-alignment.tsx";
import BubbleCollapsible from "./bubble-collapsible.tsx";

describe("the bubble examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("bubble")).toEqual([]);
  });

  test("a bubble says which end it sits at", () => {
    render(() => <BubbleAlignment />);
    const ends = [...document.querySelectorAll('[data-slot="bubble"]')].map((bubble) =>
      bubble.getAttribute("data-align"),
    );
    expect(ends).toContain("start");
    expect(ends).toContain("end");
  });

  test("a long bubble shows the rest of its text and takes it back", async () => {
    render(() => <BubbleCollapsible />);
    const more = screen.getByRole("button", { name: "Show more" });
    const body = more.closest('[data-slot="bubble-content"]') as HTMLElement;
    const short = body.textContent ?? "";
    expect(short).toContain("...");

    await user.click(more);
    flush();
    expect(screen.getByRole("button", { name: "Show less" })).not.toBeNull();
    expect((body.textContent ?? "").length).toBeGreaterThan(short.length);

    await user.click(screen.getByRole("button", { name: "Show less" }));
    flush();
    expect(screen.getByRole("button", { name: "Show more" })).not.toBeNull();
  });
});
