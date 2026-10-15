import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { Signup03 } from "./signup-03.tsx";
import { hydrateBlock } from "./test-harness.ts";

describe("signup-03", () => {
  test("every field is labelled, and the form can be submitted", () => {
    render(() => <Signup03 />);
    expect(screen.getByLabelText("Full Name").getAttribute("type")).toBe("text");
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
    expect(screen.getByLabelText("Confirm Password").getAttribute("type")).toBe("password");
    expect(screen.getByRole("button", { name: "Create Account" }).getAttribute("type")).toBe(
      "submit",
    );
  });

  test("the two passwords share one row, under one description", () => {
    render(() => <Signup03 />);
    const password = screen.getByLabelText("Password").closest('[data-slot="field"]');
    const confirm = screen.getByLabelText("Confirm Password").closest('[data-slot="field"]');
    expect(password?.parentElement).toBe(confirm?.parentElement as HTMLElement);
    const row = password?.parentElement;
    expect(row?.getAttribute("data-slot")).toBe("field");
    expect(row?.nextElementSibling?.textContent).toBe("Must be at least 8 characters long.");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("signup-03.tsx", "Signup03");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector("form")).not.toBeNull();
    result.unmount();
  });
});
