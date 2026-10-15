import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { Login04 } from "./login-04.tsx";
import { hydrateBlock } from "./test-harness.ts";

describe("login-04", () => {
  test("every field is labelled, and the form can be submitted", () => {
    render(() => <Login04 />);
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
    expect(screen.getByRole("button", { name: "Login" }).getAttribute("type")).toBe("submit");
  });

  test("the three providers are named, because each is only an icon", () => {
    render(() => <Login04 />);
    for (const provider of ["Apple", "Google", "Meta"]) {
      expect(screen.getByRole("button", { name: `Login with ${provider}` })).not.toBeNull();
    }
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("login-04.tsx", "Login04");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector("form")).not.toBeNull();
    result.unmount();
  });
});
