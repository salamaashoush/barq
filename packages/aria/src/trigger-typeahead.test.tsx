import { describe, expect, test } from "bun:test";
import { For, Show, createSignal, flush } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, user } from "@barqjs/testing";

import { applyTrigger, triggerMatch, triggerTypeahead } from "./trigger-typeahead.ts";

const NAMES = ["API_TOKEN", "APP_PASSWORD", "BASE_URL"];

interface FieldProps {
  initial?: string;
  disabled?: boolean;
}

function Field(props: FieldProps) {
  const [value, setValue] = createSignal(props.initial ?? "");
  const typeahead = triggerTypeahead<string>({
    pattern: /\{\{(\w*)$/,
    options: (query) => NAMES.filter((name) => name.startsWith(query.toUpperCase())),
    insert: (name, _match, after) => (after.startsWith("}}") ? name : `${name}}}`),
    onChange: setValue,
    isDisabled: () => props.disabled === true,
  });
  return (
    <div>
      <input
        aria-label="URL"
        value={value()}
        {...typeahead.inputProps}
        onInput={(event: InputEvent) => {
          setValue((event.currentTarget as HTMLInputElement).value);
          (typeahead.inputProps.onInput as (event: Event) => void)(event);
        }}
      />
      <Show when={typeahead.isOpen()}>
        <ul {...typeahead.listProps} aria-label="Names">
          <For each={typeahead.options()}>
            {(name, index) => <li {...typeahead.optionProps(index())}>{name}</li>}
          </For>
        </ul>
      </Show>
      <output data-testid="value">{value()}</output>
    </div>
  );
}

function field(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("combobox", { name: "URL" });
}

describe("triggerMatch", () => {
  test("finds the trigger and its query right before the caret", () => {
    expect(triggerMatch("a {{AP", 6, /\{\{(\w*)$/)).toEqual({ query: "AP", from: 4, to: 6 });
    expect(triggerMatch("a {{AP}} b", 10, /\{\{(\w*)$/)).toBeNull();
    expect(triggerMatch("{{", 2, /\{\{(\w*)$/)).toEqual({ query: "", from: 2, to: 2 });
  });

  test("applyTrigger replaces the match and puts the caret after it", () => {
    expect(applyTrigger("x {{AP y", { query: "AP", from: 4, to: 6 }, "API_TOKEN}}")).toEqual({
      value: "x {{API_TOKEN}} y",
      caret: 15,
    });
  });
});

describe("triggerTypeahead", () => {
  test("opens after the trigger, narrows as the query is typed, and Enter chooses", async () => {
    render(() => <Field />);
    expect(field().getAttribute("aria-expanded")).toBe("false");
    await user.type(field(), "https://{{A");
    flush();
    expect(field().getAttribute("aria-expanded")).toBe("true");
    const list = screen.getByRole("listbox", { name: "Names" });
    expect(field().getAttribute("aria-controls")).toBe(list.id);
    expect(screen.getAllByRole("option").map((one) => one.textContent)).toEqual([
      "API_TOKEN",
      "APP_PASSWORD",
    ]);
    expect(field().getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[0]?.id ?? "",
    );
    await user.keyboard("{ArrowDown}");
    flush();
    expect(screen.getAllByRole("option")[1]?.getAttribute("aria-selected")).toBe("true");
    expect(field().getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[1]?.id ?? "",
    );
    await user.keyboard("{ArrowDown}");
    flush();
    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowUp}{Enter}");
    flush();
    expect(field().value).toBe("https://{{APP_PASSWORD}}");
    expect(screen.getByTestId("value").textContent).toBe("https://{{APP_PASSWORD}}");
    expect(field().selectionStart).toBe(field().value.length);
    expect(screen.queryByRole("listbox")).toBeNull();
    await expectNoAriaViolations(document.body);
  });

  test("keeps the closing braces already there, and a click chooses", async () => {
    render(() => <Field />);
    const input = field();
    input.focus();
    input.value = "{{B}}";
    input.setSelectionRange(3, 3);
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    flush();
    await user.click(screen.getByRole("option", { name: "BASE_URL" }));
    flush();
    expect(field().value).toBe("{{BASE_URL}}");
  });

  test("Escape closes the list without touching the text, and a disabled field offers nothing", async () => {
    render(() => <Field />);
    await user.type(field(), "{{");
    flush();
    expect(screen.getAllByRole("option").length).toBe(3);
    await user.keyboard("{Escape}");
    flush();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field().value).toBe("{{");
    await user.type(field(), "Z");
    flush();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("a disabled field never opens", async () => {
    render(() => <Field disabled />);
    await user.type(field(), "{{");
    flush();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
