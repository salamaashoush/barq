import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import CardDemo from "./card-demo.tsx";
import CardRtl from "./card-rtl.tsx";
import CardSmall from "./card-small.tsx";
import CardSpacing from "./card-spacing.tsx";

const card = (): HTMLElement => document.querySelector('[data-slot="card"]') as HTMLElement;

describe("the card examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("card")).toEqual([]);
  });

  test("the login card labels both of its fields and puts the action in the header", () => {
    render(() => <CardDemo />);
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
    expect(
      screen.getByRole("button", { name: "Sign Up" }).closest('[data-slot="card-action"]'),
    ).not.toBeNull();
  });

  test("the small card says its size", () => {
    render(() => <CardSmall />);
    expect(card().getAttribute("data-size")).toBe("sm");
  });

  test("choosing a spacing moves the card's token", async () => {
    render(() => <CardSpacing />);
    expect(card().style.getPropertyValue("--card-spacing")).toBe("calc(var(--spacing) * 4)");

    await user.click(screen.getByRole("button", { name: "24px" }));
    flush();
    expect(card().style.getPropertyValue("--card-spacing")).toBe("calc(var(--spacing) * 6)");
    expect(screen.getByRole("button", { name: "24px" }).getAttribute("aria-pressed")).toBe("true");
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <CardRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="card"]')).not.toBeNull();
  });
});
