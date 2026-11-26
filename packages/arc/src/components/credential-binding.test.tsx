import { afterEach, describe, expect, test } from "bun:test";
import { createSignal } from "@barqjs/core";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { settle } from "../test-arc.ts";
import {
  type CredentialBindings,
  CredentialBindingList,
  credentialBindings,
  defaultCredentialBinding,
} from "./credential-binding.tsx";
import { ENGLISH } from "./messages.ts";

afterEach(() => destroyAnnouncer());

const CREDENTIALS = [
  { name: "EMAIL", origin: "from the field 'Email' on shop.example.com" },
  { name: "PASSWORD", origin: "from the field 'Password' on shop.example.com" },
  { name: "OTP_SEED" },
];

describe("CredentialBindingList", () => {
  test("each secret defaults to a same-named stored one, else the captured value", () => {
    expect(defaultCredentialBinding("EMAIL", ["EMAIL"], true)).toEqual({
      source: "existing",
      secret: "EMAIL",
    });
    expect(defaultCredentialBinding("PASSWORD", ["EMAIL"], true)).toEqual({
      source: "capture",
      scope: "",
    });
    expect(defaultCredentialBinding("PASSWORD", [], false)).toEqual({
      source: "new",
      value: "",
      scope: "",
    });
    expect(Object.keys(credentialBindings(CREDENTIALS, {}, ["EMAIL"], true))).toEqual([
      "EMAIL",
      "PASSWORD",
      "OTP_SEED",
    ]);
  });

  test("a source per secret, each with its own control, named after the secret", async () => {
    const [value, setValue] = createSignal<CredentialBindings>({});
    render(() => (
      <CredentialBindingList
        label="Secrets"
        credentials={CREDENTIALS}
        existing={["EMAIL", "SHOP_PASSWORD"]}
        canCapture
        scopes={[{ value: "staging", label: "Staging" }]}
        value={value()}
        onChange={setValue}
      />
    ));
    await settle();
    expect(screen.getByRole("list", { name: "Secrets" })).toBeDefined();
    expect(screen.getByText("from the field 'Password' on shop.example.com")).toBeDefined();
    expect(screen.getByRole("button", { name: /The secret EMAIL reads/ }).textContent).toContain(
      "EMAIL",
    );
    expect(screen.getByRole("button", { name: /Where PASSWORD is saved/ })).toBeDefined();

    await user.click(screen.getByRole("button", { name: /Where PASSWORD comes from/ }));
    await settle();
    await user.click(screen.getByRole("option", { name: "Type a value" }));
    await settle();
    const typed = screen.getByLabelText<HTMLInputElement>("The value of PASSWORD");
    expect(typed.type).toBe("password");
    expect(typed.getAttribute("autocomplete")).toBe("new-password");
    await user.type(typed, "hunter2");
    await settle();
    expect(value().PASSWORD).toEqual({ source: "new", value: "hunter2", scope: "" });
    expect(value().EMAIL).toEqual({ source: "existing", secret: "EMAIL" });
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a choice still missing is said on its row once touched", async () => {
    render(() => (
      <CredentialBindingList
        label="Secrets"
        credentials={[{ name: "TOKEN" }]}
        existing={["API_TOKEN"]}
        defaultValue={{ TOKEN: { source: "existing", secret: "" } }}
      />
    ));
    await settle();
    expect(screen.queryByText(ENGLISH.chooseSecretFor("TOKEN"))).toBeNull();
    await user.click(screen.getByRole("button", { name: /Where TOKEN comes from/ }));
    await settle();
    await user.click(screen.getByRole("option", { name: "Use a stored secret" }));
    await settle();
    expect(screen.getByText("Choose the secret TOKEN reads.")).toBeDefined();
    expect(screen.getByText("Choose where each secret comes from.")).toBeDefined();
  });

  test("with nothing stored, a stored secret cannot be chosen; read only lists each", async () => {
    render(() => (
      <>
        <CredentialBindingList label="Secrets" credentials={[{ name: "KEY" }]} existing={[]} />
        <CredentialBindingList
          label="Kept"
          credentials={[{ name: "A" }, { name: "B" }]}
          existing={["A"]}
          canCapture
          isReadOnly
        />
      </>
    ));
    await settle();
    expect(screen.getByLabelText("The value of KEY")).toBeDefined();
    expect(screen.getByText("Reads A")).toBeDefined();
    expect(screen.getByText("Saved from what was captured")).toBeDefined();
  });
});
