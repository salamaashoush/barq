import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { Signup04 } from "./signup-04.tsx";
import { hydrateBlock } from "./test-harness.ts";

describe("signup-04", () => {
  test("every field is labelled, and the form can be submitted", () => {
    render(() => <Signup04 />);
    expect(screen.getByRole("heading", { name: "Create your account" })).not.toBeNull();
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
    expect(screen.getByLabelText("Confirm Password").getAttribute("type")).toBe("password");
    expect(screen.getByRole("button", { name: "Create Account" }).getAttribute("type")).toBe(
      "submit",
    );
  });

  test("the three providers are named, because each is only an icon", () => {
    render(() => <Signup04 />);
    for (const provider of ["Apple", "Google", "Meta"]) {
      const button = screen.getByRole("button", { name: `Sign up with ${provider}` });
      expect(button.getAttribute("type")).toBe("button");
      expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  test("the cover sits inside the card, beside the form", () => {
    render(() => <Signup04 />);
    const cover = document.querySelector('[data-slot="signup-04-cover"]');
    expect(cover?.getAttribute("aria-hidden")).toBe("true");
    expect(cover?.previousElementSibling?.tagName).toBe("FORM");
    expect(cover?.closest('[data-slot="card"]')).not.toBeNull();
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("signup-04.tsx", "Signup04");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector('[data-slot="signup-04-cover"]')).not.toBeNull();
    result.unmount();
  });
});
