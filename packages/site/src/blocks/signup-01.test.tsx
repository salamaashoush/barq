import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { Signup01 } from "./signup-01.tsx";
import { hydrateBlock } from "./test-harness.ts";

describe("signup-01", () => {
  test("every field is labelled, and the form can be submitted", () => {
    render(() => <Signup01 />);
    expect(screen.getByLabelText("Full Name").getAttribute("type")).toBe("text");
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
    expect(screen.getByLabelText("Confirm Password").getAttribute("type")).toBe("password");
    expect(screen.getByRole("button", { name: "Create Account" }).getAttribute("type")).toBe(
      "submit",
    );
  });

  test("every input is required", () => {
    render(() => <Signup01 />);
    const inputs = [...document.querySelectorAll("input")];
    expect(inputs).toHaveLength(4);
    for (const input of inputs) expect(input.hasAttribute("required")).toBe(true);
  });

  test("the provider button does not submit the form", () => {
    render(() => <Signup01 />);
    const google = screen.getByRole("button", { name: "Sign up with Google" });
    expect(google.getAttribute("type")).toBe("button");
    expect(google.closest("form")).not.toBeNull();
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("signup-01.tsx", "Signup01");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector("form")).not.toBeNull();
    result.unmount();
  });
});
