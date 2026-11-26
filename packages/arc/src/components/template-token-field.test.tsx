import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { TemplateTokenField, templateReferences } from "./template-token-field.tsx";

const TOKENS = [
  { name: "BASE_URL" },
  { name: "API_TOKEN", secret: true },
  { name: "REGION", description: "eu-west-1" },
];

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

function field(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("combobox", { name: "URL" });
}

function typeAt(input: HTMLInputElement, value: string, caret = value.length): void {
  input.focus();
  input.value = value;
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  flush();
}

describe("templateReferences", () => {
  test("names each reference once, spaces inside the braces allowed", () => {
    expect(templateReferences("{{BASE_URL}}/a?k={{ API_TOKEN }}&b={{BASE_URL}}")).toEqual([
      "BASE_URL",
      "API_TOKEN",
    ]);
    expect(templateReferences("no references")).toEqual([]);
  });
});

describe("TemplateTokenField", () => {
  test("offers the names after {{, marks a secret, and writes the choice with its braces", async () => {
    const changes: string[] = [];
    render(() => (
      <TemplateTokenField label="URL" tokens={TOKENS} onChange={(value) => changes.push(value)} />
    ));
    const input = field();
    expect(input.getAttribute("placeholder")).toBe("{{NAME}}");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    typeAt(input, "https://x/{{");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const options = screen.getAllByRole("option");
    expect(options.map((one) => one.textContent)).toEqual([
      "BASE_URLVariable",
      "API_TOKENSecret",
      "REGIONeu-west-1",
    ]);
    typeAt(input, "https://x/{{a");
    expect(screen.getAllByRole("option").map((one) => one.textContent)).toEqual([
      "BASE_URLVariable",
      "API_TOKENSecret",
    ]);
    await user.keyboard("{ArrowDown}");
    flush();
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[1]?.id ?? "",
    );
    await user.keyboard("{Enter}");
    flush();
    expect(input.value).toBe("https://x/{{API_TOKEN}}");
    expect(changes.at(-1)).toBe("https://x/{{API_TOKEN}}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(ariaViolations(document.body)).toEqual([]);
  });

  test("a click chooses, and closing braces already there are kept", () => {
    render(() => <TemplateTokenField label="URL" tokens={TOKENS} />);
    const input = field();
    typeAt(input, "{{RE}}", 4);
    screen.getByRole("option", { name: "REGION eu-west-1" }).click();
    flush();
    expect(input.value).toBe("{{REGION}}");
  });

  test("warns about a name it does not know, without marking the field invalid", async () => {
    const [value, setValue] = createSignal("{{BASE_URL}}/{{MISSING}}");
    render(() => (
      <TemplateTokenField label="URL" tokens={TOKENS} value={value()} onChange={setValue} />
    ));
    await settle();
    const warning = document.querySelector('[data-slot="template-token-field-unknown"]');
    expect(warning?.textContent).toBe("MISSING is not defined here.");
    expect(field().getAttribute("aria-describedby")).toContain(warning?.id ?? "-");
    expect(field().hasAttribute("aria-invalid")).toBe(false);
    setValue("{{BASE_URL}}");
    flush();
    expect(document.querySelector('[data-slot="template-token-field-unknown"]')).toBeNull();
  });

  test("disabled offers nothing; an error marks it invalid", () => {
    render(() => (
      <TemplateTokenField label="URL" tokens={TOKENS} isDisabled errorMessage="Enter a URL." />
    ));
    const input = field();
    expect(input.disabled).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    typeAt(input, "{{");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("stays left to right on a right-to-left page", () => {
    render(() => (
      <Rtl>
        <TemplateTokenField label="العنوان" tokens={TOKENS} defaultValue="{{BASE_URL}}/health" />
      </Rtl>
    ));
    const input = screen.getByRole<HTMLInputElement>("combobox", { name: "العنوان" });
    expect(input.getAttribute("dir")).toBe("ltr");
    expect(input.value).toBe("{{BASE_URL}}/health");
  });

  test("is hydrated in place", async () => {
    const result = await hydrates(`
      import { TemplateTokenField } from "<arc>";
      export function Page() {
        return (
          <TemplateTokenField
            label="URL"
            tokens={[{ name: "BASE_URL" }]}
            defaultValue="{{BASE_URL}}/{{NOPE}}"
            description="Reference a secret so its value never shows."
          />
        );
      }
    `);
    expect(result.container.textContent).toContain("NOPE is not defined here.");
    result.unmount();
  });
});
