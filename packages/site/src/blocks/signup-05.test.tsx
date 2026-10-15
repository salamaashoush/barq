import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { Signup05 } from "./signup-05.tsx";
import { hydrateBlock } from "./test-harness.ts";

describe("signup-05", () => {
  test("the one field is labelled, and the form can be submitted", () => {
    render(() => <Signup05 />);
    expect(screen.getByRole("heading", { name: "Welcome to Acme Inc." })).not.toBeNull();
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
    expect(document.querySelectorAll("input")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Create Account" }).getAttribute("type")).toBe(
      "submit",
    );
  });

  test("the brand link is an icon, so its name is written for a screen reader", () => {
    render(() => <Signup05 />);
    expect(screen.getByRole("link", { name: "Acme Inc." })).not.toBeNull();
  });

  test("the two providers are named and do not submit the form", () => {
    render(() => <Signup05 />);
    for (const provider of ["Apple", "Google"]) {
      const button = screen.getByRole("button", { name: `Continue with ${provider}` });
      expect(button.getAttribute("type")).toBe("button");
    }
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("signup-05.tsx", "Signup05");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector("form")).not.toBeNull();
    result.unmount();
  });
});
