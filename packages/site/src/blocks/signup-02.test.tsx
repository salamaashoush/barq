import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { Signup02 } from "./signup-02.tsx";
import { hydrateBlock } from "./test-harness.ts";

describe("signup-02", () => {
  test("every field is labelled, and the form can be submitted", () => {
    render(() => <Signup02 />);
    expect(screen.getByLabelText("Full Name").getAttribute("type")).toBe("text");
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
    expect(screen.getByLabelText("Confirm Password").getAttribute("type")).toBe("password");
    expect(screen.getByRole("button", { name: "Create Account" }).getAttribute("type")).toBe(
      "submit",
    );
  });

  test("the provider button does not submit the form", () => {
    render(() => <Signup02 />);
    const github = screen.getByRole("button", { name: "Sign up with GitHub" });
    expect(github.getAttribute("type")).toBe("button");
    expect(github.closest("form")).not.toBeNull();
  });

  test("the cover is the second column, and says nothing to a screen reader", () => {
    render(() => <Signup02 />);
    const cover = document.querySelector('[data-slot="signup-02-cover"]');
    expect(cover?.getAttribute("aria-hidden")).toBe("true");
    expect(cover?.parentElement?.getAttribute("data-slot")).toBe("signup-02");
    expect(cover?.previousElementSibling?.querySelector("form")).not.toBeNull();
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("signup-02.tsx", "Signup02");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector('[data-slot="signup-02-cover"]')).not.toBeNull();
    result.unmount();
  });
});
