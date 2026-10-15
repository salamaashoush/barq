import { describe, expect, test } from "bun:test";

import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import ProgressControlled from "./progress-controlled.tsx";
import ProgressLabel from "./progress-label.tsx";

describe("the progress examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("progress")).toEqual([]);
  });

  test("the bar is named by the field's label and says its value", () => {
    render(() => <ProgressLabel />);
    const bar = screen.getByRole("progressbar", { name: /Upload progress/ });
    expect(bar.getAttribute("aria-valuenow")).toBe("66");
  });

  test("the bar follows the slider", async () => {
    render(() => <ProgressControlled />);
    const bar = screen.getByRole("progressbar", { name: "Progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("50");

    screen.getByRole("slider").focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    flush();
    expect(bar.getAttribute("aria-valuenow")).toBe("52");
  });
});
