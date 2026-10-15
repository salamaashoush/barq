import { describe, expect, test } from "bun:test";

import { render, screen } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import SpinnerButton from "./spinner-button.tsx";
import SpinnerDemo from "./spinner-demo.tsx";

describe("the spinner examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("spinner")).toEqual([]);
  });

  test("a spinner is a status that says it is loading", () => {
    render(() => <SpinnerDemo />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Loading");
  });

  test("a loading button is disabled and holds its spinner", () => {
    render(() => <SpinnerButton />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons.every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(buttons.every((button) => button.querySelector('[role="status"]') !== null)).toBe(true);
  });
});
