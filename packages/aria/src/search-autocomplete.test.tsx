import { describe, expect, test } from "bun:test";
import { type Child, createRoot, createSignal, flush } from "@barqjs/core";
import { ref as makeRef } from "@barqjs/primitives/refs";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
  within,
} from "@barqjs/testing";
import type { Key } from "./collections.ts";
import { Form } from "./form.tsx";
import { provideLocale } from "./i18n.ts";
import { Option } from "./listbox.tsx";
import { destroyAnnouncer } from "./live.ts";
import {
  SearchAutocomplete,
  searchAutocomplete,
  searchAutocompleteState,
} from "./search-autocomplete.tsx";

interface Item {
  id: string;
  name: string;
}

const items: Item[] = [
  { id: "1", name: "One" },
  { id: "2", name: "Two" },
  { id: "3", name: "Three" },
];

type Props = Omit<Parameters<typeof SearchAutocomplete<Item>>[0], "children" | "items"> & {
  items?: Item[];
};

function Search(props: Props) {
  return (
    <SearchAutocomplete<Item> label="Test" {...props} items={props.items ?? items}>
      {(item) => <Option>{item.name}</Option>}
    </SearchAutocomplete>
  );
}

function input(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("combobox");
}

/** Type into the field the way a browser does: the value first, then the event. */
function type(text: string): void {
  const element = input();
  element.value = text;
  user.keyDown(text.slice(-1) || "Backspace");
  element.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
}

function optionTexts(): string[] {
  return within(screen.getByRole("listbox"))
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
}

function highlighted(): string | undefined {
  const id = input().getAttribute("aria-activedescendant");
  return id === null ? undefined : (document.getElementById(id)?.textContent ?? undefined);
}

function press(key: string): void {
  user.keyDown(key);
  flush();
}

describe("SearchAutocomplete", () => {
  test("renders a labelled combobox that is a search field", () => {
    render(() => <Search />);
    const field = input();
    expect(field.getAttribute("type")).toBe("search");
    expect(field.getAttribute("aria-autocomplete")).toBe("list");
    expect(field.getAttribute("aria-expanded")).toBe("false");
    expect(field.hasAttribute("aria-controls")).toBe(false);
    expect(field.getAttribute("autocomplete")).toBe("off");
    expect(accessibleName(field)).toBe("Test");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("shows a custom icon before the input", () => {
    render(() => <Search icon={<svg data-testid="search-icon" />} />);
    expect(screen.getByTestId("search-icon")).toBeTruthy();
  });

  test("can be disabled", () => {
    const changes: string[] = [];
    render(() => <Search isDisabled onInputChange={(value) => changes.push(value)} />);
    expect(input().disabled).toBe(true);
    user.type(input(), "o");
    flush();
    expect(changes).toEqual([]);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("can be read-only: no list, no clear button", () => {
    const changes: string[] = [];
    render(() => (
      <Search
        isReadOnly
        defaultInputValue="Blargh"
        onInputChange={(value) => changes.push(value)}
      />
    ));
    expect(input().readOnly).toBe(true);
    user.focus(input());
    press("ArrowDown");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(changes).toEqual([]);
  });

  test("typing opens the list, filtered by contains", async () => {
    const opened: [boolean, string | undefined][] = [];
    render(() => <Search onOpenChange={(isOpen, trigger) => opened.push([isOpen, trigger])} />);
    user.focus(input());
    type("o");
    await tick();

    expect(optionTexts()).toEqual(["One", "Two"]);
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(input().getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    expect(opened).toEqual([[true, "input"]]);
  });

  test("custom data attributes reach the input", () => {
    render(() => <Search data-testid="search" class="field" />);
    expect(screen.getByTestId("search")).toBe(input());
    expect(input().closest(".field")).not.toBeNull();
  });

  test("a ref reaches the input, and focusing it focuses the field", () => {
    const inputRef = makeRef<HTMLInputElement>();
    render(() => <Search ref={inputRef.set} />);
    expect(inputRef()).toBe(input());
    inputRef()?.focus();
    expect(document.activeElement).toBe(input());
  });

  test("menuTrigger=focus opens on focus", async () => {
    render(() => <Search menuTrigger="focus" />);
    user.focus(input());
    await tick();
    expect(optionTexts()).toEqual(["One", "Two", "Three"]);
  });

  test("ArrowDown opens the list on the first option", async () => {
    const opened: [boolean, string | undefined][] = [];
    render(() => <Search onOpenChange={(isOpen, trigger) => opened.push([isOpen, trigger])} />);
    user.focus(input());
    press("ArrowDown");
    await tick();
    expect(opened).toEqual([[true, "manual"]]);
    expect(highlighted()).toBe("One");
    expect(document.activeElement).toBe(input());
  });

  test("ArrowUp opens the list on the last option", async () => {
    render(() => <Search />);
    user.focus(input());
    press("ArrowUp");
    await tick();
    expect(highlighted()).toBe("Three");
  });

  test("a query matching nothing closes the list, or never opens it", async () => {
    render(() => <Search />);
    user.focus(input());
    type("o");
    await tick();
    expect(screen.getByRole("listbox")).toBeTruthy();

    type("ox");
    await tick();
    expect(screen.queryByRole("listbox")).toBeNull();

    type("z");
    await tick();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("a disabled key is not highlighted by the arrows", async () => {
    render(() => <Search disabledKeys={["1"]} />);
    user.focus(input());
    type("o");
    await tick();
    press("ArrowDown");
    expect(highlighted()).toBe("Two");
  });

  test("the arrows move the highlight while focus stays in the field", async () => {
    render(() => <Search />);
    user.focus(input());
    type("o");
    await tick();
    press("ArrowDown");
    expect(highlighted()).toBe("One");
    press("ArrowDown");
    expect(highlighted()).toBe("Two");
    press("ArrowUp");
    expect(highlighted()).toBe("One");
    expect(document.activeElement).toBe(input());
  });

  test("Enter on a suggestion submits its key, fills the field and closes", async () => {
    const submitted: [string | null, Key | null][] = [];
    render(() => <Search onSubmit={(value, key) => submitted.push([value, key])} />);
    user.focus(input());
    type("t");
    await tick();
    press("ArrowDown");
    press("Enter");

    expect(submitted).toEqual([[null, "2"]]);
    expect(input().value).toBe("Two");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("Enter with nothing highlighted submits the text", async () => {
    const submitted: [string | null, Key | null][] = [];
    render(() => <Search onSubmit={(value, key) => submitted.push([value, key])} />);
    user.focus(input());
    type("Tw");
    await tick();
    const proceeded = user.keyDown("Enter");
    flush();

    expect(proceeded).toBe(false);
    expect(submitted).toEqual([["Tw", null]]);
    expect(input().value).toBe("Tw");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("Enter on the already chosen suggestion closes the list", async () => {
    const submitted: [string | null, Key | null][] = [];
    render(() => (
      <Search menuTrigger="focus" onSubmit={(value, key) => submitted.push([value, key])} />
    ));
    user.focus(input());
    await tick();
    press("ArrowDown");
    press("Enter");
    expect(submitted).toEqual([[null, "1"]]);

    press("ArrowDown");
    await tick();
    press("Enter");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("a click on a suggestion submits it", async () => {
    const submitted: [string | null, Key | null][] = [];
    render(() => <Search onSubmit={(value, key) => submitted.push([value, key])} />);
    user.focus(input());
    type("o");
    await tick();
    user.click(screen.getByRole("option", { name: "Two" }));
    flush();
    expect(submitted).toEqual([[null, "2"]]);
    expect(input().value).toBe("Two");
  });

  test("a space alone matches nothing", async () => {
    render(() => <Search />);
    user.focus(input());
    type(" ");
    await tick();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("typing clears the highlight", async () => {
    render(() => <Search />);
    user.focus(input());
    type("o");
    await tick();
    press("ArrowDown");
    expect(highlighted()).toBe("One");
    type("on");
    await tick();
    expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  });

  test("Left and Right clear the highlight", async () => {
    render(() => <Search />);
    user.focus(input());
    type("o");
    await tick();
    press("ArrowDown");
    expect(highlighted()).toBe("One");
    press("ArrowLeft");
    expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  });

  test("clearing the field with menuTrigger=focus keeps the list open on everything", async () => {
    render(() => <Search menuTrigger="focus" />);
    user.focus(input());
    type("o");
    await tick();
    expect(optionTexts()).toEqual(["One", "Two"]);
    type("");
    await tick();
    expect(optionTexts()).toEqual(["One", "Two", "Three"]);
    expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  });

  test("an input event changes the text once", () => {
    const changes: string[] = [];
    render(() => <Search onInputChange={(value) => changes.push(value)} />);
    user.focus(input());
    type("a");
    expect(changes).toEqual(["a"]);
  });

  test("blurring closes the list and keeps what was typed", async () => {
    const submitted: [string | null, Key | null][] = [];
    render(() => (
      <>
        <Search onSubmit={(value, key) => submitted.push([value, key])} />
        <button type="button">elsewhere</button>
      </>
    ));
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    user.focus(input());
    type("Th");
    await tick();
    expect(screen.getByRole("listbox")).toBeTruthy();
    user.focus(elsewhere);
    await tick();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input().value).toBe("Th");
    expect(submitted).toEqual([]);
  });

  test("a controlled input value is followed", () => {
    const [value, setValue] = createSignal("one");
    render(() => <Search inputValue={value()} />);
    expect(input().value).toBe("one");
    setValue("two");
    flush();
    expect(input().value).toBe("two");
  });

  test("a custom filter decides what stays", async () => {
    render(() => <Search filterBy={(text, query) => text.startsWith(query.toUpperCase())} />);
    user.focus(input());
    type("t");
    await tick();
    expect(optionTexts()).toEqual(["Two", "Three"]);
  });

  test("new items are shown as they arrive", async () => {
    const [list, setList] = createSignal(items);
    render(() => <Search items={list()} />);
    user.focus(input());
    type("o");
    await tick();
    expect(optionTexts()).toEqual(["One", "Two"]);
    setList([...items, { id: "4", name: "Four" }]);
    flush();
    await tick();
    expect(optionTexts()).toEqual(["One", "Two", "Four"]);
  });

  test("the default text selects nothing", () => {
    render(() => <Search defaultInputValue="Two" />);
    expect(input().value).toBe("Two");
    expect(screen.queryByRole("option")).toBeNull();
  });

  test("an invalid field says so", () => {
    render(() => <Search isInvalid errorMessage="Wrong" />);
    expect(input().getAttribute("aria-invalid")).toBe("true");
  });
});

describe("SearchAutocomplete's clear button and Escape", () => {
  test("the clear button is there only while there is text", () => {
    render(() => <Search />);
    expect(screen.queryByRole("button", { hidden: true })).toBeNull();
    user.focus(input());
    type("o");
    expect(screen.getByRole("button", { hidden: true }).textContent).toBe("Clear");
  });

  test("pressing it clears the field, keeps focus there, and reports it", () => {
    let cleared = 0;
    const changes: string[] = [];
    render(() => (
      <Search
        defaultInputValue="Two"
        onClear={() => cleared++}
        onInputChange={(value) => changes.push(value)}
      />
    ));
    user.focus(input());
    user.click(screen.getByRole("button", { hidden: true }));
    flush();
    expect(input().value).toBe("");
    expect(cleared).toBe(1);
    expect(changes).toEqual([""]);
    expect(document.activeElement).toBe(input());
  });

  test("Escape clears the text, and goes no further", () => {
    let outside = 0;
    let cleared = 0;
    render(() => (
      <div onKeyDown={(event: KeyboardEvent) => (outside += event.key === "Escape" ? 1 : 0)}>
        <Search defaultInputValue="Two" onClear={() => cleared++} />
      </div>
    ));
    user.focus(input());
    press("Escape");
    expect(input().value).toBe("");
    expect(cleared).toBe(1);
    expect(outside).toBe(0);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("Escape on an empty field is someone else's", () => {
    let outside = 0;
    render(() => (
      <div onKeyDown={(event: KeyboardEvent) => (outside += event.key === "Escape" ? 1 : 0)}>
        <Search />
      </div>
    ));
    user.focus(input());
    press("Escape");
    expect(outside).toBe(1);
  });

  test("Escape with the list open clears and closes", async () => {
    render(() => <Search />);
    user.focus(input());
    type("o");
    await tick();
    press("ArrowDown");
    press("Escape");
    expect(input().value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("the clear button's text is in the page's language", () => {
    function German(props: { children?: Child }) {
      const localeProps = provideLocale(() => "de-DE");
      return <div {...localeProps}>{props.children}</div>;
    }
    render(() => (
      <German>
        <Search defaultInputValue="x" />
      </German>
    ));
    expect(screen.getByRole("button", { hidden: true }).textContent).toBe("Löschen");
  });
});

describe("SearchAutocomplete loadingState", () => {
  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  test("no indicator while the list is closed", async () => {
    render(() => <Search loadingState="filtering" />);
    await wait(550);
    flush();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("an indicator with a closed list when menuTrigger is manual, after the delay", async () => {
    render(() => <Search loadingState="filtering" menuTrigger="manual" />);
    flush();
    expect(screen.queryByRole("progressbar")).toBeNull();
    await wait(550);
    flush();
    expect(screen.getByRole("progressbar").getAttribute("aria-label")).toBe("Loading...");
  });

  test("loading shows the indicator after half a second, and hides it when done", async () => {
    const [state, setState] = createSignal<"loading" | "idle">("loading");
    render(() => <Search loadingState={state()} />);
    flush();
    await wait(200);
    flush();
    expect(screen.queryByRole("progressbar")).toBeNull();
    await wait(350);
    flush();
    expect(screen.getByRole("progressbar")).toBeTruthy();

    setState("idle");
    flush();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("a load that finishes first never shows the indicator", async () => {
    const [state, setState] = createSignal<"loading" | "idle">("loading");
    render(() => <Search loadingState={state()} />);
    flush();
    setState("idle");
    flush();
    await wait(550);
    flush();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("typing restarts the delay, since that is a new request", async () => {
    render(() => <Search loadingState="filtering" menuTrigger="manual" />);
    user.focus(input());
    await wait(300);
    type("o");
    await wait(300);
    flush();
    expect(screen.queryByRole("progressbar")).toBeNull();
    await wait(250);
    flush();
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  test("an asynchronous list says when it has no results", async () => {
    render(() => <Search loadingState="idle" items={[]} menuTrigger="focus" />);
    user.focus(input());
    await tick();
    const list = screen.getByRole("listbox");
    expect(list.textContent).toBe("No results");
  });

  test("loading more shows an indicator in the list's popover", async () => {
    render(() => <Search loadingState="loadingMore" menuTrigger="focus" />);
    user.focus(input());
    await tick();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });
});

describe("SearchAutocomplete in a form", () => {
  test("submits the text under its name", () => {
    render(() => (
      <Form>
        <Search name="query" defaultInputValue="Th" />
      </Form>
    ));
    const form = input().form as HTMLFormElement;
    expect(new FormData(form).get("query")).toBe("Th");
  });

  test("the text is what is validated, as it changes", async () => {
    render(() => (
      <Search
        validate={(value: string) => (value.length < 3 ? "Too short" : null)}
        validationBehavior="aria"
        defaultInputValue="a"
      />
    ));
    user.focus(input());
    type("ab");
    user.blur(input());
    await tick();
    flush();
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Too short")).toBeTruthy();

    user.focus(input());
    type("abcd");
    user.blur(input());
    await tick();
    flush();
    expect(input().hasAttribute("aria-invalid")).toBe(false);
    expect(screen.queryByText("Too short")).toBeNull();
  });
});

describe("what a search autocomplete tells a screen reader", () => {
  function announcements(): string[] {
    const region = document.querySelector("[data-barq-live-announcer]");
    if (region === null) return [];
    return [...region.querySelectorAll('[role="log"] > div')].map(
      (entry) => entry.textContent ?? "",
    );
  }

  test("opening announces how many suggestions there are", async () => {
    destroyAnnouncer();
    render(() => <Search />);
    user.focus(input());
    type("o");
    await tick();
    expect(announcements()).toContain("2 options available.");
  });

  test("while it is open the rest of the page is hidden", async () => {
    render(() => (
      <>
        <p>behind</p>
        <Search />
      </>
    ));
    user.focus(input());
    type("o");
    await tick();
    expect(screen.getByText("behind").closest("[aria-hidden=true]")).not.toBeNull();
    expect(input().closest("[aria-hidden=true]")).toBeNull();
  });

  test("has no ARIA violations, closed and open", async () => {
    const { container } = render(() => <Search />);
    expectNoAriaViolations(container);
    user.focus(input());
    type("o");
    await tick();
    expectNoAriaViolations(document.body);
  });
});

describe("searchAutocomplete", () => {
  test("labels the input and the list, and keeps them apart until open", () => {
    createRoot((dispose) => {
      const inputRef = makeRef<HTMLInputElement>();
      const listBoxRef = makeRef<HTMLElement>();
      const state = searchAutocompleteState({ items });
      const { labelProps, inputProps, listBoxProps } = searchAutocomplete(
        { label: "test label", inputRef, listBoxRef },
        state,
      );
      const read = (value: unknown): unknown => (typeof value === "function" ? value() : value);
      expect(read(labelProps.id)).toBeTruthy();
      expect(read(inputProps["aria-labelledby"])).toBe(read(labelProps.id));
      expect(read(inputProps.role)).toBe("combobox");
      expect(read(inputProps["aria-autocomplete"])).toBe("list");
      expect(read(inputProps["aria-controls"])).toBeFalsy();
      expect(read(inputProps["aria-activedescendant"])).toBeFalsy();
      expect(read(listBoxProps.id)).toBeTruthy();
      dispose();
    });
  });

  test("ArrowDown and ArrowUp open the list at either end", () => {
    const opened: [boolean, string | undefined][] = [];
    const { state, inputProps, dispose } = createRoot((release) => {
      const inputRef = makeRef<HTMLInputElement>();
      inputRef.set(document.createElement("input"));
      const created = searchAutocompleteState({
        items,
        onOpenChange: (isOpen, trigger) => opened.push([isOpen, trigger]),
      });
      const result = searchAutocomplete(
        { label: "test label", inputRef, listBoxRef: makeRef<HTMLElement>() },
        created,
      );
      return { state: created, inputProps: result.inputProps, dispose: release };
    });
    const keyDown = inputProps.onKeyDown as (event: KeyboardEvent) => void;

    keyDown(new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true }));
    flush();
    expect(state.focusStrategy()).toBe("first");
    expect(opened).toEqual([[true, "manual"]]);

    state.close();
    flush();
    keyDown(new KeyboardEvent("keydown", { key: "ArrowUp", cancelable: true }));
    flush();
    expect(state.focusStrategy()).toBe("last");
    dispose();
  });
});
