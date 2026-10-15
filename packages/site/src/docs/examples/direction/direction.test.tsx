import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import DirectionDemo from "./direction-demo.tsx";
import DirectionUseDirection from "./direction-use-direction.tsx";

describe("the direction examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("direction")).toEqual([]);
  });

  test("the card sits inside an element that says right to left", () => {
    render(() => <DirectionDemo />);
    expect(document.querySelector('[dir="rtl"] [data-slot="card"]')).not.toBeNull();
  });

  test("the direction in scope follows the provider, and the element follows with it", async () => {
    render(() => <DirectionUseDirection />);
    const reading = screen.getByRole("status");
    expect(reading.textContent).toBe("ltr");
    expect(reading.parentElement?.getAttribute("dir")).toBe("ltr");

    await user.click(screen.getByRole("button", { name: "Switch direction" }));
    flush();
    expect(reading.textContent).toBe("rtl");
    expect(reading.parentElement?.getAttribute("dir")).toBe("rtl");
  });
});
