import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { Login01 } from "./login-01.tsx";
import { hydrateBlock } from "./test-harness.ts";

describe("login-01", () => {
  test("every field is labelled, and the form can be submitted", () => {
    render(() => <Login01 />);
    expect(screen.getByText("Login to your account")).not.toBeNull();
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
    expect(screen.getByRole("button", { name: "Login" }).getAttribute("type")).toBe("submit");
  });

  test("the provider button does not submit the form", () => {
    render(() => <Login01 />);
    const google = screen.getByRole("button", { name: "Login with Google" });
    expect(google.getAttribute("type")).toBe("button");
    expect(google.closest("form")).not.toBeNull();
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("login-01.tsx", "Login01");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector("form")).not.toBeNull();
    result.unmount();
  });
});
