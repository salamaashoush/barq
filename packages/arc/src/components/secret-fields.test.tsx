import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import {
  accessibleDescription,
  ariaViolations,
  fireEvent,
  render,
  screen,
  user,
  waitFor,
} from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { FileOrPasteField } from "./file-or-paste-field.tsx";
import { useArcForm } from "./form.tsx";
import {
  CopyableField,
  SecretField,
  SecretReferenceField,
  StoredSecretField,
  referencedSecret,
  secretReference,
} from "./secret-fields.tsx";

afterEach(() => destroyAnnouncer());

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

function pasteInto(element: Element, text: string): void {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
  element.dispatchEvent(event);
}

describe("SecretField", () => {
  test("hidden as it is typed, shown by a toggle, and kept from autofill", async () => {
    const [value, setValue] = createSignal("");
    render(() => <SecretField label="API token" value={value()} onChange={setValue} />);
    await settle();
    const input = screen.getByLabelText<HTMLInputElement>("API token");
    expect(input.type).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    await user.type(input, "acme_demo_1");
    await settle();
    expect(value()).toBe("acme_demo_1");
    const show = screen.getByRole("button", { name: "Show the value" });
    expect(show.getAttribute("aria-pressed")).toBe("false");
    await user.click(show);
    await settle();
    expect(input.type).toBe("text");
    expect(
      screen.getByRole("button", { name: "Hide the value" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("several lines are a text area drawn as dots until shown", async () => {
    render(() => (
      <SecretField
        label="Private key"
        multiline
        defaultValue={"-----BEGIN KEY-----\nabc\n-----END KEY-----"}
      />
    ));
    await settle();
    const area = screen.getByLabelText<HTMLTextAreaElement>("Private key");
    expect(area.tagName).toBe("TEXTAREA");
    expect(area.value.split("\n")).toHaveLength(3);
    const hidden = area.className;
    await user.click(screen.getByRole("button", { name: "Show the value" }));
    await settle();
    expect(area.className).not.toBe(hidden);
  });

  test("with a choice, a paste of several lines turns several lines on", async () => {
    const [value, setValue] = createSignal("");
    render(() => (
      <SecretField label="Value" multiline="choose" value={value()} onChange={setValue} />
    ));
    await settle();
    const lines = screen.getByRole("switch", {
      name: "Several lines, such as a private key or a certificate",
    });
    expect(
      lines.getAttribute("aria-checked") === "true" || (lines as HTMLInputElement).checked,
    ).toBe(false);
    pasteInto(screen.getByLabelText("Value"), "line one\nline two");
    await settle();
    expect(value()).toBe("line one\nline two");
    expect(screen.getByLabelText("Value").tagName).toBe("TEXTAREA");
  });

  test("inside a form it is the form's, and a form error marks it", async () => {
    let submitted = "";
    function Form() {
      const form = useArcForm(() => ({
        defaultValues: { token: "" },
        validators: {
          onSubmit: ({ value }) =>
            value.token === "" ? { fields: { token: "Type the token." } } : undefined,
        },
        onSubmit: ({ value }) => {
          submitted = value.token;
        },
      }));
      return (
        <form.AppForm>
          <form
            onSubmit={(event: Event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.AppField name="token">
              {(field) => <field.SecretField label="Token" />}
            </form.AppField>
            <button type="submit">Save</button>
          </form>
        </form.AppForm>
      );
    }
    render(() => <Form />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Type the token.")).toBeDefined());
    const input = screen.getByLabelText("Token");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await user.type(input, "abc");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(submitted).toBe("abc"));
  });

  test("reads left to right on a right-to-left page, disabled", async () => {
    render(() => (
      <Rtl>
        <SecretField label="الرمز" defaultValue="abc" isDisabled />
      </Rtl>
    ));
    await settle();
    const input = screen.getByLabelText<HTMLInputElement>("الرمز");
    expect(input.getAttribute("dir")).toBe("ltr");
    expect(input.disabled).toBe(true);
  });
});

describe("StoredSecretField", () => {
  test("a kept secret says how it ends; blank keeps it and typing replaces it", async () => {
    const [value, setValue] = createSignal<string | null>("");
    render(() => (
      <StoredSecretField
        label="Signing secret"
        stored={{ hint: "x7Qa" }}
        value={value()}
        onChange={setValue}
      />
    ));
    await settle();
    const input = screen.getByLabelText<HTMLInputElement>("Signing secret");
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Stored, ending in x7Qa. Leave blank to keep it.");
    expect(input.getAttribute("autocomplete")).toBe("new-password");
    expect(accessibleDescription(input)).toContain("It is stored and never shown.");
    await user.type(input, "whsec_new");
    await settle();
    expect(value()).toBe("whsec_new");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("forgotten, it holds null and says so until kept again", async () => {
    const [value, setValue] = createSignal<string | null>("");
    render(() => (
      <StoredSecretField
        label="Token"
        stored={{ hint: "abcd", since: "2026-03-01" }}
        forgettable
        value={value()}
        onChange={setValue}
      />
    ));
    await settle();
    expect(screen.getByText(/One ending in abcd has been in use since/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Forget it" }));
    await settle();
    expect(value()).toBeNull();
    expect(screen.queryByLabelText("Token")).toBeNull();
    expect(screen.getByText("It is forgotten once you save.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    await settle();
    expect(value()).toBe("");
    expect(document.activeElement).toBe(screen.getByLabelText("Token"));
  });

  test("once where it goes changes, a blank field is refused with why", async () => {
    render(() => <StoredSecretField label="Vault token" stored={{}} mustReenter defaultValue="" />);
    await settle();
    const input = screen.getByLabelText<HTMLInputElement>("Vault token");
    expect(input.placeholder).toBe("Type it again");
    expect(accessibleDescription(input)).toContain("Where it is sent has changed");
    input.focus();
    input.blur();
    fireEvent.blur(input);
    await settle();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByText("Type it again. A stored secret goes only where it was given."),
    ).toBeDefined();
  });

  test("nothing kept: a plain secret, required on create", async () => {
    render(() => <StoredSecretField label="Key" isRequired defaultValue="" />);
    await settle();
    const input = screen.getByLabelText<HTMLInputElement>("Key");
    expect(input.placeholder).toBe("");
    expect(input.required).toBe(true);
    fireEvent.blur(input);
    await settle();
    expect(screen.getByText("Type the secret.")).toBeDefined();
  });
});

describe("SecretReferenceField", () => {
  test("references a stored secret by name, and none holds an empty value", async () => {
    expect(secretReference("CLIENT_KEY")).toBe("{{CLIENT_KEY}}");
    expect(referencedSecret(" {{ CLIENT_KEY }} ")).toBe("CLIENT_KEY");
    expect(referencedSecret("-----BEGIN")).toBeUndefined();
    const [value, setValue] = createSignal("");
    render(() => (
      <SecretReferenceField
        label="Client key"
        secrets={["CLIENT_KEY", "CORP_CA"]}
        value={value()}
        onChange={setValue}
      />
    ));
    await settle();
    const trigger = screen.getByRole("button", { name: /Client key/ });
    await user.click(trigger);
    await settle();
    await user.click(screen.getByRole("option", { name: "CLIENT_KEY" }));
    await settle();
    expect(value()).toBe("{{CLIENT_KEY}}");
    await user.click(screen.getByRole("button", { name: /Client key/ }));
    await settle();
    await user.click(screen.getByRole("option", { name: "None" }));
    await settle();
    expect(value()).toBe("");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a reference to a secret no longer stored stays, named and invalid", async () => {
    render(() => (
      <SecretReferenceField label="Client key" secrets={["CORP_CA"]} defaultValue="{{OLD_KEY}}" />
    ));
    await settle();
    expect(screen.getByText("No stored secret is named OLD_KEY.")).toBeDefined();
    expect(screen.getByRole("button", { name: /Client key/ }).textContent).toContain(
      "OLD_KEY (not found)",
    );
  });
});

describe("CopyableField", () => {
  test("read only, selected whole on focus, with a copy button named after it", async () => {
    render(() => (
      <CopyableField label="Location ID" value="eu-west-private" description="It never changes." />
    ));
    await settle();
    const input = screen.getByLabelText<HTMLInputElement>("Location ID");
    expect(input.readOnly).toBe(true);
    expect(accessibleDescription(input)).toBe("It never changes.");
    input.focus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("eu-west-private".length);
    expect(screen.getByRole("button", { name: "Copy Location ID" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});

function picker(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function pick(files: File[]): void {
  Object.defineProperty(picker(), "files", { configurable: true, value: files });
  fireEvent.change(picker());
}

function source(): string | null | undefined {
  return document.querySelector('[data-slot="file-or-paste-field-source"]')?.textContent;
}

describe("FileOrPasteField", () => {
  test("a chosen file is read into it and named beside the button", async () => {
    const [value, setValue] = createSignal("");
    render(() => (
      <FileOrPasteField label="Certificate" accept={[".pem"]} value={value()} onChange={setValue} />
    ));
    await settle();
    expect(source()).toBe("Or paste it above, or drop a file on it.");
    pick([new File(["-----BEGIN CERTIFICATE-----"], "corp.pem", { type: "" })]);
    await waitFor(() => expect(value()).toBe("-----BEGIN CERTIFICATE-----"));
    expect(source()).toMatch(/^Read from corp\.pem, /);
    await user.type(screen.getByLabelText("Certificate"), "\n");
    await settle();
    expect(source()).toBe("Or paste it above, or drop a file on it.");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a file it does not accept is not read, and says why", async () => {
    const [value, setValue] = createSignal("kept");
    render(() => (
      <FileOrPasteField
        label="Storage state"
        accept={[".json"]}
        maxSize={10}
        value={value()}
        onChange={setValue}
      />
    ));
    await settle();
    pick([new File(["x".repeat(20)], "state.json", { type: "application/json" })]);
    await waitFor(() =>
      expect(document.querySelector('[data-slot="field-error"]')?.textContent).toMatch(
        /^state\.json is larger than 10/,
      ),
    );
    expect(value()).toBe("kept");
    expect(screen.getByLabelText("Storage state").getAttribute("aria-invalid")).toBe("true");
  });

  test("pasted text is held as typed, and the choose button is reached by Tab", async () => {
    render(() => <FileOrPasteField label="CSV" defaultValue="" isRequired />);
    await settle();
    const area = screen.getByLabelText("CSV");
    user.paste(area, "a,b\n1,2");
    await settle();
    expect((area as HTMLTextAreaElement).value).toBe("a,b\n1,2");
    area.focus();
    user.tab();
    expect(document.activeElement?.textContent).toContain("Choose a file");
  });
});

describe("secret fields on the server", () => {
  test("are hydrated in place", async () => {
    const result = await hydrates(`
      import { CopyableField, FileOrPasteField, SecretField, SecretReferenceField, StoredSecretField } from "<arc>";
      export function Page() {
        return (
          <div>
            <SecretField label="Token" defaultValue="abc" multiline="choose" />
            <StoredSecretField label="Signing" stored={{ hint: "x7Qa", since: "2026-03-01" }} forgettable defaultValue="" />
            <SecretReferenceField label="Key" secrets={["A"]} defaultValue="{{B}}" />
            <CopyableField label="ID" value="eu-west" />
            <FileOrPasteField label="Certificate" defaultValue="" />
          </div>
        );
      }
    `);
    expect(result.container.textContent).toContain("x7Qa");
    result.unmount();
  });
});
