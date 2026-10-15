import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { Login03 } from "./login-03.tsx";
import { hydrateBlock } from "./test-harness.ts";

describe("login-03", () => {
  test("every field is labelled, and the form can be submitted", () => {
    render(() => <Login03 />);
    expect(screen.getByText("Welcome back")).not.toBeNull();
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
    expect(screen.getByRole("button", { name: "Login" }).getAttribute("type")).toBe("submit");
  });

  test("the two providers come before the email form and do not submit it", () => {
    render(() => <Login03 />);
    const email = screen.getByLabelText("Email");
    for (const provider of ["Apple", "Google"]) {
      const button = screen.getByRole("button", { name: `Login with ${provider}` });
      expect(button.getAttribute("type")).toBe("button");
      expect(
        button.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeGreaterThan(0);
    }
  });

  test("the separator carries its words between the two halves", () => {
    render(() => <Login03 />);
    const content = document.querySelector('[data-slot="field-separator-content"]');
    expect(content?.textContent).toBe("Or continue with");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("login-03.tsx", "Login03");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector("form")).not.toBeNull();
    result.unmount();
  });
});
