import { describe, expect, test } from "bun:test";
import { createSignal, flush, For, type Child, type Incoming } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";
import { Button } from "./button.tsx";
import type { Key } from "./collections.ts";
import {
  ComboBox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxClear,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxItem,
} from "./combobox.tsx";
import { provideLocale } from "./i18n.ts";
import { Option } from "./listbox.tsx";

interface Fruit {
  id: string;
  name: string;
}

const FRUITS: Fruit[] = [
  { id: "apple", name: "Apple" },
  { id: "banana", name: "Banana" },
  { id: "blackberry", name: "Blackberry" },
  { id: "cherry", name: "Cherry" },
];

function Picker(
  props: Incoming<{
    defaultSelectedKey?: Key | null;
    allowsCustomValue?: boolean;
    menuTrigger?: "input" | "focus" | "manual";
    onSelectionChange?: (key: Key | null) => void;
    onInputChange?: (value: string) => void;
  }>,
) {
  return (
    <ComboBox
      label="Fruit"
      items={FRUITS}
      defaultSelectedKey={props.defaultSelectedKey?.()}
      allowsCustomValue={props.allowsCustomValue?.()}
      menuTrigger={props.menuTrigger?.()}
      onSelectionChange={props.onSelectionChange?.()}
      onInputChange={props.onInputChange?.()}
      getTextValue={(fruit: Fruit) => fruit.name}
    >
      {(fruit: Fruit) => <Option>{fruit.name}</Option>}
    </ComboBox>
  );
}

function input(): HTMLInputElement {
  return screen.getByRole("combobox") as HTMLInputElement;
}

/** Type into the field the way a browser does: the value first, then the event. */
function type(text: string): void {
  const element = input();
  element.value = text;
  user.keyDown(text.slice(-1) || "Backspace");
  element.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
}

describe("ComboBox", () => {
  test("is a named combobox with nothing open", () => {
    render(() => <Picker />);

    expect(accessibleName(input())).toBe("Fruit");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(input().getAttribute("aria-autocomplete")).toBe("list");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("typing opens the list and filters it", async () => {
    render(() => <Picker />);

    user.focus(input());
    type("b");
    await tick();

    const options = screen.getAllByRole("option");
    expect(options.map((option: Element) => option.textContent)).toEqual(["Banana", "Blackberry"]);
    expect(input().getAttribute("aria-expanded")).toBe("true");
  });

  test("the match ignores case and accents", async () => {
    render(() => <Picker />);

    user.focus(input());
    type("CHER");
    await tick();

    expect(screen.getAllByRole("option").map((option: Element) => option.textContent)).toEqual([
      "Cherry",
    ]);
  });

  test("the caret stays in the input while the arrows move the highlight", async () => {
    render(() => <Picker />);

    user.focus(input());
    type("b");
    await tick();

    user.keyDown("ArrowDown");
    flush();

    expect(document.activeElement).toBe(input());
    const highlighted = input().getAttribute("aria-activedescendant");
    expect(highlighted).not.toBeNull();
    expect(document.getElementById(highlighted as string)?.textContent).toBe("Banana");

    user.keyDown("ArrowDown");
    flush();
    expect(
      document.getElementById(input().getAttribute("aria-activedescendant") as string)?.textContent,
    ).toBe("Blackberry");
  });

  test("no option is ever focused", async () => {
    render(() => <Picker />);

    user.focus(input());
    type("b");
    await tick();
    user.keyDown("ArrowDown");
    flush();

    for (const option of screen.getAllByRole("option")) {
      expect(option.getAttribute("tabindex")).toBeNull();
    }
  });

  test("Enter takes the highlighted option and closes", async () => {
    const chosen: (Key | null)[] = [];
    render(() => <Picker onSelectionChange={(key) => chosen.push(key)} />);

    user.focus(input());
    type("b");
    await tick();
    user.keyDown("ArrowDown");
    flush();
    user.keyDown("Enter");
    flush();

    expect(chosen).toEqual(["banana"]);
    expect(input().value).toBe("Banana");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("clicking an option takes it", async () => {
    const chosen: (Key | null)[] = [];
    render(() => <Picker onSelectionChange={(key) => chosen.push(key)} />);

    user.focus(input());
    type("b");
    await tick();
    user.click(screen.getByRole("option", { name: "Blackberry" }));
    flush();

    expect(chosen).toEqual(["blackberry"]);
    expect(input().value).toBe("Blackberry");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("Escape puts the selected option's text back", async () => {
    render(() => <Picker defaultSelectedKey="cherry" />);

    expect(input().value).toBe("Cherry");

    user.focus(input());
    type("b");
    await tick();
    user.keyDown("Escape");
    flush();

    expect(input().value).toBe("Cherry");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("blurring commits, so the field never shows what it is not", async () => {
    render(() => <Picker defaultSelectedKey="cherry" />);

    user.focus(input());
    type("appl");
    await tick();

    user.blur(input());
    flush();

    expect(input().value).toBe("Cherry");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("allowsCustomValue keeps what was typed", async () => {
    const chosen: (Key | null)[] = [];
    render(() => (
      <Picker
        allowsCustomValue
        defaultSelectedKey="cherry"
        onSelectionChange={(key) => chosen.push(key)}
      />
    ));

    user.focus(input());
    type("kumquat");
    flush();
    user.blur(input());
    flush();

    expect(input().value).toBe("kumquat");
    expect(chosen).toEqual([null]);
  });

  test("clearing the field clears the value", async () => {
    const chosen: (Key | null)[] = [];
    render(() => (
      <Picker defaultSelectedKey="cherry" onSelectionChange={(key) => chosen.push(key)} />
    ));

    user.focus(input());
    type("");
    flush();

    expect(chosen).toEqual([null]);
  });

  test("ArrowDown opens the whole list, unfiltered", async () => {
    render(() => <Picker defaultSelectedKey="cherry" />);

    user.focus(input());
    user.keyDown("ArrowDown");
    await tick();

    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  test("the button opens and closes the list without taking focus", async () => {
    render(() => <Picker />);

    const toggle = screen.getByRole("button");
    expect(toggle.getAttribute("tabindex")).toBe("-1");

    user.click(toggle);
    await tick();

    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(document.activeElement).toBe(input());

    user.click(toggle);
    flush();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("menuTrigger=focus opens on focus", async () => {
    render(() => <Picker menuTrigger="focus" />);

    user.focus(input());
    await tick();

    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  test("a query matching nothing closes the list", async () => {
    render(() => <Picker />);

    user.focus(input());
    type("b");
    await tick();
    expect(screen.queryByRole("listbox")).not.toBeNull();

    type("bzzz");
    flush();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("the input reports what was typed", async () => {
    const typed: string[] = [];
    render(() => <Picker onInputChange={(value) => typed.push(value)} />);

    user.focus(input());
    type("ba");

    expect(typed).toEqual(["ba"]);
  });

  test("has no ARIA violations, closed and open", async () => {
    const { container } = render(() => <Picker />);
    expectNoAriaViolations(container);

    user.focus(input());
    type("b");
    await tick();
    expectNoAriaViolations(container);
  });
});

/**
 * The combobox written as parts: an input, a popup, a list and its items, each
 * its own element, finding one another through the root.
 */
const FRAMEWORKS = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"];

/** The portal builds on a microtask after its marker connects. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

/** Focus is given back on a frame, after the popup that held it has gone. */
function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function field(): HTMLInputElement {
  return screen.getByRole("combobox") as HTMLInputElement;
}

function optionTexts(): (string | null)[] {
  return screen.getAllByRole("option").map((option) => option.textContent);
}

/** The option the input names as active, which is the highlight under virtual focus. */
function activeOption(): HTMLElement | null {
  const named = field().getAttribute("aria-activedescendant");
  return named === null ? null : document.getElementById(named);
}

interface InlineProps {
  defaultValue?: string | null;
  value?: string | null;
  autoHighlight?: boolean;
  disabled?: boolean;
  name?: string;
  open?: boolean;
  filter?: ((item: string, query: string) => boolean) | null;
  onValueChange?: (value: string | null) => void;
  onInputValueChange?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
}

function Inline(props: Incoming<InlineProps>) {
  return (
    <ComboboxRoot
      items={FRAMEWORKS}
      defaultValue={props.defaultValue?.()}
      value={props.value?.()}
      autoHighlight={props.autoHighlight?.()}
      disabled={props.disabled?.()}
      name={props.name?.()}
      open={props.open?.()}
      filter={props.filter?.()}
      onValueChange={(value) => props.onValueChange?.()?.(value as string | null)}
      onInputValueChange={props.onInputValueChange?.()}
      onOpenChange={props.onOpenChange?.()}
    >
      <ComboboxInput aria-label="Framework" placeholder="Select a framework" />
      <ComboboxTrigger>
        <Button aria-label="Show frameworks">v</Button>
      </ComboboxTrigger>
      <ComboboxClear>
        <Button aria-label="Clear">x</Button>
      </ComboboxClear>
      <ComboboxPopup data-testid="popup">
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem value={item} disabled={item === "Nuxt.js"}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </ComboboxRoot>
  );
}

describe("a combobox written as parts", () => {
  test("is a combobox that says it has a list and that the list is shut", () => {
    render(() => <Inline />);

    expect(accessibleName(field())).toBe("Framework");
    expect(field().getAttribute("aria-expanded")).toBe("false");
    expect(field().getAttribute("aria-autocomplete")).toBe("list");
    expect(field().hasAttribute("aria-controls")).toBe(false);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("ArrowDown opens the list and highlights the first option, the caret staying put", async () => {
    render(() => <Inline />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();

    const list = screen.getByRole("listbox");
    expect(field().getAttribute("aria-expanded")).toBe("true");
    expect(field().getAttribute("aria-controls")).toBe(list.id);
    expect(activeOption()?.textContent).toBe("Next.js");
    expect(activeOption()?.hasAttribute("data-highlighted")).toBe(true);
    expect(document.activeElement).toBe(field());
    expect(optionTexts()).toEqual(FRAMEWORKS);
  });

  test("ArrowUp opens it from the other end", async () => {
    render(() => <Inline />);
    user.focus(field());
    user.keyDown("ArrowUp");
    await settle();

    expect(activeOption()?.textContent).toBe("Astro");
  });

  test("the arrows, Home and End move the highlight and pass a disabled option", async () => {
    render(() => <Inline />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();

    user.keyDown("ArrowDown");
    expect(activeOption()?.textContent).toBe("SvelteKit");
    // Nuxt.js is disabled, so Down lands on Remix.
    user.keyDown("ArrowDown");
    expect(activeOption()?.textContent).toBe("Remix");
    user.keyDown("ArrowUp");
    expect(activeOption()?.textContent).toBe("SvelteKit");
    user.keyDown("End");
    expect(activeOption()?.textContent).toBe("Astro");
    user.keyDown("Home");
    expect(activeOption()?.textContent).toBe("Next.js");
    expect(screen.getByText("Nuxt.js").getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(field());
  });

  test("typing opens the list and keeps only what matches", async () => {
    const typed: string[] = [];
    render(() => <Inline onInputValueChange={(value) => typed.push(value)} />);
    user.focus(field());
    await user.type(field(), "re");
    await settle();

    expect(optionTexts()).toEqual(["Remix"]);
    expect(typed.at(-1)).toBe("re");
    // Nothing is highlighted until an arrow says so.
    expect(activeOption()).toBeNull();
  });

  test("autoHighlight highlights the first match as the text changes", async () => {
    render(() => <Inline autoHighlight />);
    user.focus(field());
    await user.type(field(), "s");
    await settle();

    expect(activeOption()?.textContent).toBe("Next.js");
    await user.type(field(), "v");
    await settle();
    expect(activeOption()?.textContent).toBe("SvelteKit");
  });

  test("Enter takes the highlighted option, writes its label and closes", async () => {
    const chosen: (string | null)[] = [];
    const opened: boolean[] = [];
    render(() => (
      <Inline
        onValueChange={(value) => chosen.push(value)}
        onOpenChange={(open) => opened.push(open)}
      />
    ));
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();
    user.keyDown("ArrowDown");
    user.keyDown("Enter");
    await settle();

    expect(chosen).toEqual(["SvelteKit"]);
    expect(field().value).toBe("SvelteKit");
    expect(opened).toEqual([true, false]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  test("a pointer press takes an option without taking focus from the input", async () => {
    const chosen: (string | null)[] = [];
    render(() => <Inline onValueChange={(value) => chosen.push(value)} />);
    user.focus(field());
    user.click(field());
    await settle();

    user.click(screen.getByRole("option", { name: "Remix" }));
    await settle();
    expect(chosen).toEqual(["Remix"]);
    expect(field().value).toBe("Remix");
    expect(document.activeElement).toBe(field());
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("a pointer over an option highlights it, and the arrows carry on from there", async () => {
    render(() => <Inline />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();

    user.hover(screen.getByRole("option", { name: "Remix" }));
    flush();
    expect(activeOption()?.textContent).toBe("Remix");
    user.keyDown("ArrowDown");
    expect(activeOption()?.textContent).toBe("Astro");
    expect(document.activeElement).toBe(field());
  });

  test("the chosen option is the selected one the next time the list opens, and all of them show", async () => {
    render(() => <Inline defaultValue="Remix" />);
    expect(field().value).toBe("Remix");

    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();
    // The text in the field is the value's label, not a query, until it is typed over.
    expect(optionTexts()).toEqual(FRAMEWORKS);
    const remix = screen.getByRole("option", { name: "Remix" });
    expect(remix.getAttribute("aria-selected")).toBe("true");
    expect(remix.getAttribute("data-state")).toBe("checked");
    expect(screen.getByRole("option", { name: "Astro" }).getAttribute("data-state")).toBe(
      "unchecked",
    );
  });

  test("Escape closes the list, and a second Escape clears the value and the text", async () => {
    const chosen: (string | null)[] = [];
    render(() => <Inline defaultValue="Remix" onValueChange={(value) => chosen.push(value)} />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();

    user.keyDown("Escape");
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field().value).toBe("Remix");
    expect(chosen).toEqual([]);

    user.keyDown("Escape");
    await settle();
    expect(chosen).toEqual([null]);
    expect(field().value).toBe("");
  });

  test("text that matches nothing leaves the list open on its empty state", async () => {
    render(() => <Inline />);
    user.focus(field());
    await user.type(field(), "zzz");
    await settle();

    expect(field().getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("No items found.");
    expect(screen.getByTestId("popup").hasAttribute("data-empty")).toBe(true);
    expect(screen.getByRole("listbox").hasAttribute("data-empty")).toBe(true);
  });

  test("the empty state says nothing while there is something to choose", async () => {
    render(() => <Inline />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();

    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByTestId("popup").hasAttribute("data-empty")).toBe(false);
  });

  test("leaving the field with half a query puts the value's label back", async () => {
    render(() => (
      <>
        <Inline defaultValue="Remix" />
        <button type="button">after</button>
      </>
    ));
    user.focus(field());
    await user.type(field(), "x");
    await settle();
    expect(field().value).toBe("Remixx");

    user.focus(screen.getByRole("button", { name: "after" }));
    await settle();
    expect(field().value).toBe("Remix");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("emptying the field by hand clears the value", async () => {
    const chosen: (string | null)[] = [];
    render(() => <Inline defaultValue="Astro" onValueChange={(value) => chosen.push(value)} />);
    user.focus(field());
    field().value = "";
    field().dispatchEvent(new Event("input", { bubbles: true }));
    await settle();

    expect(chosen).toEqual([null]);
  });

  test("the clear button is there only when there is a value, and empties both", async () => {
    const chosen: (string | null)[] = [];
    render(() => <Inline defaultValue="Astro" onValueChange={(value) => chosen.push(value)} />);

    const clear = screen.getByRole("button", { name: "Clear" });
    user.click(clear);
    await settle();
    expect(chosen).toEqual([null]);
    expect(field().value).toBe("");
    expect(document.activeElement).toBe(field());
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  test("the trigger toggles the list, says so, and is not a second Tab stop", async () => {
    render(() => <Inline />);
    const trigger = screen.getByRole("button", { name: "Show frameworks" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("tabindex")).toBe("-1");

    user.click(trigger);
    await settle();
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(document.activeElement).toBe(field());

    user.click(trigger);
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger.getAttribute("data-state")).toBe("closed");
  });

  test("the popup says where it is and that it is open", async () => {
    render(() => <Inline />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();

    const popup = screen.getByTestId("popup");
    expect(popup.getAttribute("data-state")).toBe("open");
    expect(popup.hasAttribute("data-open")).toBe(true);
    expect(popup.getAttribute("data-side")).toBe("bottom");
    expect(popup.getAttribute("data-align")).toBe("start");
    expect(popup.parentElement?.getAttribute("style") ?? "").toContain("position");
    // Portalled, so the box the input sits in cannot clip it.
    expect(field().parentElement?.contains(popup)).toBe(false);
  });

  test("a disabled combobox opens for nothing", async () => {
    render(() => <Inline disabled />);
    expect(field().disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Show frameworks" }).hasAttribute("disabled")).toBe(
      true,
    );
    user.click(field());
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("a controlled value follows its owner, text included", async () => {
    const [value, setValue] = createSignal<string | null>("Astro");
    render(() => <Inline value={value()} onValueChange={setValue} />);
    expect(field().value).toBe("Astro");

    setValue("Remix");
    await settle();
    expect(field().value).toBe("Remix");
  });

  test("a controlled list opens only when its owner says so", async () => {
    const asked: boolean[] = [];
    render(() => <Inline open={false} onOpenChange={(open) => asked.push(open)} />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();

    expect(asked).toEqual([true]);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("the filter can be replaced, or turned off", async () => {
    render(() => <Inline filter={(item, query) => item.startsWith(query)} />);
    user.focus(field());
    await user.type(field(), "N");
    await settle();
    expect(optionTexts()).toEqual(["Next.js", "Nuxt.js"]);
  });

  test("with the filter off every item stays", async () => {
    render(() => <Inline filter={null} />);
    user.focus(field());
    await user.type(field(), "zzz");
    await settle();
    expect(optionTexts()).toEqual(FRAMEWORKS);
  });

  test("a name puts the value in the form", async () => {
    const { container } = render(() => (
      <form>
        <Inline name="framework" defaultValue="Astro" />
      </form>
    ));
    const form = container.querySelector("form") as HTMLFormElement;
    expect(new FormData(form).get("framework")).toBe("Astro");
  });

  test("has no ARIA violations, closed and open", async () => {
    const { container } = render(() => <Inline defaultValue="Astro" />);
    expectNoAriaViolations(container);

    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();
    expectNoAriaViolations(document.body);
  });
});

interface Country {
  code: string;
  label: string;
}

const EGYPT: Country = { code: "eg", label: "Egypt" };
const FRANCE: Country = { code: "fr", label: "France" };
const JAPAN: Country = { code: "jp", label: "Japan" };
const COUNTRIES: Country[] = [EGYPT, FRANCE, JAPAN];

function Tick() {
  const item = useComboboxItem();
  return <span data-testid="tick">{item.isSelected() ? "x" : ""}</span>;
}

function Popup(props: Incoming<{ onValueChange?: (value: Country | null) => void }>) {
  return (
    <ComboboxRoot
      items={COUNTRIES}
      defaultValue={EGYPT}
      itemToStringValue={(country: Country) => country.code}
      onValueChange={(value) => props.onValueChange?.()?.(value as Country | null)}
    >
      <ComboboxTrigger>
        <Button aria-label="Country">
          <ComboboxValue placeholder="Pick a country" />
        </Button>
      </ComboboxTrigger>
      <ComboboxPopup>
        <ComboboxInput aria-label="Search countries" />
        <ComboboxList>
          {(country: Country) => (
            <ComboboxItem value={country}>
              {country.label}
              <Tick />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </ComboboxRoot>
  );
}

describe("a combobox whose input is inside its popup", () => {
  test("the trigger is a button showing the value's label, and is the Tab stop", () => {
    render(() => <Popup />);
    const trigger = screen.getByRole("button", { name: "Country" });
    expect(trigger.textContent).toBe("Egypt");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("tabindex")).not.toBe("-1");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  test("opening moves focus to the search input, which starts empty", async () => {
    render(() => <Popup />);
    user.click(screen.getByRole("button", { name: "Country" }));
    await settle();

    expect(document.activeElement).toBe(field());
    expect(field().value).toBe("");
    expect(optionTexts()).toEqual(["Egyptx", "France", "Japan"]);
  });

  test("ArrowDown on the trigger opens it too", async () => {
    render(() => <Popup />);
    user.focus(screen.getByRole("button", { name: "Country" }));
    user.keyDown("ArrowDown");
    await settle();
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  test("choosing hands back the item itself, closes and returns focus to the trigger", async () => {
    const chosen: (Country | null)[] = [];
    render(() => <Popup onValueChange={(value) => chosen.push(value)} />);
    const trigger = screen.getByRole("button", { name: "Country" });
    trigger.focus();
    user.click(trigger);
    await settle();

    await user.type(field(), "ja");
    await settle();
    expect(optionTexts()).toEqual(["Japan"]);
    user.keyDown("ArrowDown");
    user.keyDown("Enter");
    await settle();
    await frame();
    await frame();

    expect(chosen).toEqual([JAPAN]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger.textContent).toBe("Japan");
    expect(document.activeElement).toBe(trigger);
  });

  test("Escape closes it and returns focus to the trigger", async () => {
    render(() => <Popup />);
    const trigger = screen.getByRole("button", { name: "Country" });
    trigger.focus();
    user.click(trigger);
    await settle();

    user.keyDown("Escape");
    await settle();
    await frame();
    await frame();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.textContent).toBe("Egypt");
  });
});

interface ManyProps {
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
}

function Many(props: Incoming<ManyProps>) {
  return (
    <ComboboxRoot
      multiple
      items={FRAMEWORKS}
      defaultValue={props.defaultValue?.()}
      onValueChange={(value) => props.onValueChange?.()?.(value as string[])}
    >
      <ComboboxChips aria-label="Chosen frameworks" data-testid="chips">
        <ComboboxValue>
          {(values: string[]) => (
            <>
              <For each={values}>
                {(value: string) => (
                  <ComboboxChip data-testid="chip">
                    {value}
                    <ComboboxChipRemove>
                      <Button aria-label={`Remove ${value}`}>x</Button>
                    </ComboboxChipRemove>
                  </ComboboxChip>
                )}
              </For>
              <ComboboxInput aria-label="Frameworks" />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxPopup>
        <ComboboxList>
          {(item: string) => <ComboboxItem value={item}>{item}</ComboboxItem>}
        </ComboboxList>
      </ComboboxPopup>
    </ComboboxRoot>
  );
}

function chipTexts(): string[] {
  return screen.getAllByTestId("chip").map((chip) => chip.firstChild?.textContent ?? "");
}

describe("what a combobox shows for its value", () => {
  function Shown(props: Incoming<{ multiple?: boolean; children?: Child }>) {
    return (
      <ComboboxRoot
        multiple={props.multiple?.()}
        items={COUNTRIES}
        defaultValue={props.multiple?.() === true ? [EGYPT, JAPAN] : FRANCE}
        itemToStringValue={(country: Country) => country.code}
      >
        <ComboboxTrigger>
          <Button aria-label="Country">{props.children}</Button>
        </ComboboxTrigger>
        <ComboboxPopup>
          <ComboboxInput aria-label="Search countries" />
          <ComboboxList>
            {(country: Country) => <ComboboxItem value={country}>{country.label}</ComboboxItem>}
          </ComboboxList>
        </ComboboxPopup>
      </ComboboxRoot>
    );
  }

  test("several values read as their labels, in the order they were chosen", () => {
    render(() => (
      <Shown multiple>
        <ComboboxValue placeholder="None" />
      </Shown>
    ));
    expect(screen.getByRole("button", { name: "Country" }).textContent).toBe("Egypt, Japan");
  });

  test("a callback is handed the item, and again when it changes", async () => {
    render(() => (
      <Shown>
        <ComboboxValue>
          {(country: Country | null) => <b>{country === null ? "None" : country.code}</b>}
        </ComboboxValue>
      </Shown>
    ));
    const trigger = screen.getByRole("button", { name: "Country" });
    expect(trigger.textContent).toBe("fr");

    user.click(trigger);
    await settle();
    user.click(screen.getByRole("option", { name: "Japan" }));
    await settle();
    expect(trigger.textContent).toBe("jp");
  });
});

describe("a combobox holding several values", () => {
  test("choosing adds a chip, keeps the list open and clears the query", async () => {
    const seen: string[][] = [];
    render(() => <Many onValueChange={(value) => seen.push(value)} />);
    const box = field();
    user.focus(box);
    await user.type(box, "re");
    await settle();
    expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBe("true");

    user.keyDown("ArrowDown");
    user.keyDown("Enter");
    await settle();
    expect(seen).toEqual([["Remix"]]);
    expect(chipTexts()).toEqual(["Remix"]);
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(field().value).toBe("");
    // The input is the same element: the chips beside it were added, not rebuilt.
    expect(field()).toBe(box);
    expect(document.activeElement).toBe(box);

    user.click(screen.getByRole("option", { name: "Astro" }));
    await settle();
    expect(seen.at(-1)).toEqual(["Remix", "Astro"]);
    expect(chipTexts()).toEqual(["Remix", "Astro"]);
  });

  test("choosing a chosen option again takes it off", async () => {
    const seen: string[][] = [];
    render(() => <Many defaultValue={["Remix"]} onValueChange={(value) => seen.push(value)} />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();

    user.click(screen.getByRole("option", { name: "Remix" }));
    await settle();
    expect(seen).toEqual([[]]);
    expect(screen.queryAllByTestId("chip")).toHaveLength(0);
  });

  test("Backspace in the empty input takes the last chip off", async () => {
    const seen: string[][] = [];
    render(() => (
      <Many defaultValue={["Remix", "Astro"]} onValueChange={(value) => seen.push(value)} />
    ));
    user.focus(field());
    user.key("Backspace");
    await settle();

    expect(seen).toEqual([["Remix"]]);
    expect(chipTexts()).toEqual(["Remix"]);
  });

  test("Backspace with text in the input deletes text, not a chip", async () => {
    const seen: string[][] = [];
    render(() => <Many defaultValue={["Remix"]} onValueChange={(value) => seen.push(value)} />);
    user.focus(field());
    await user.type(field(), "a");
    user.key("Backspace");
    await settle();

    expect(seen).toEqual([]);
    expect(chipTexts()).toEqual(["Remix"]);
  });

  test("the arrows walk from the input through the chips and back", async () => {
    render(() => <Many defaultValue={["Remix", "Astro"]} />);
    await settle();
    const chips = screen.getAllByTestId("chip");
    user.focus(field());

    user.keyDown("ArrowLeft");
    expect(document.activeElement).toBe(chips[1] as HTMLElement);
    expect(chips[1]?.hasAttribute("data-highlighted")).toBe(true);
    user.keyDown("ArrowLeft");
    expect(document.activeElement).toBe(chips[0] as HTMLElement);
    user.keyDown("ArrowLeft");
    expect(document.activeElement).toBe(chips[0] as HTMLElement);
    user.keyDown("ArrowRight");
    expect(document.activeElement).toBe(chips[1] as HTMLElement);
    user.keyDown("ArrowRight");
    expect(document.activeElement).toBe(field());
  });

  test("Backspace or Delete on a chip removes that one and keeps the keyboard nearby", async () => {
    const seen: string[][] = [];
    render(() => (
      <Many
        defaultValue={["Remix", "Astro", "Next.js"]}
        onValueChange={(value) => seen.push(value)}
      />
    ));
    await settle();
    user.focus(field());
    user.keyDown("ArrowLeft");
    user.keyDown("ArrowLeft");
    expect(document.activeElement?.firstChild?.textContent).toBe("Astro");

    user.keyDown("Delete");
    await settle();
    expect(seen.at(-1)).toEqual(["Remix", "Next.js"]);
    expect(document.activeElement?.firstChild?.textContent).toBe("Next.js");

    user.keyDown("Backspace");
    await settle();
    expect(seen.at(-1)).toEqual(["Remix"]);
    expect(document.activeElement?.firstChild?.textContent).toBe("Remix");

    user.keyDown("Backspace");
    await settle();
    expect(seen.at(-1)).toEqual([]);
    expect(document.activeElement).toBe(field());
  });

  test("a chip's remove button takes that chip off and is not a Tab stop", async () => {
    const seen: string[][] = [];
    render(() => (
      <Many defaultValue={["Remix", "Astro"]} onValueChange={(value) => seen.push(value)} />
    ));
    await settle();
    const remove = screen.getByRole("button", { name: "Remove Remix" });
    expect(remove.getAttribute("tabindex")).toBe("-1");

    user.click(remove);
    await settle();
    expect(seen).toEqual([["Astro"]]);
    expect(chipTexts()).toEqual(["Astro"]);
  });

  test("in a right-to-left page the arrows trade places", async () => {
    function Arabic(props: Incoming<{ children?: Child }>) {
      provideLocale("ar");
      return <>{props.children}</>;
    }
    render(() => (
      <Arabic>
        <Many defaultValue={["Remix", "Astro"]} />
      </Arabic>
    ));
    await settle();
    const chips = screen.getAllByTestId("chip");
    user.focus(field());

    user.keyDown("ArrowLeft");
    expect(document.activeElement).toBe(field());
    user.keyDown("ArrowRight");
    expect(document.activeElement).toBe(chips[1] as HTMLElement);
    user.keyDown("ArrowLeft");
    expect(document.activeElement).toBe(field());
  });

  test("has no ARIA violations with chips and an open list", async () => {
    render(() => <Many defaultValue={["Remix"]} />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();
    expectNoAriaViolations(document.body);
  });
});

describe("a combobox whose items are written out", () => {
  function Written(props: Incoming<{ onValueChange?: (value: string | null) => void }>) {
    return (
      <ComboboxRoot onValueChange={(value) => props.onValueChange?.()?.(value as string | null)}>
        <ComboboxInput aria-label="Timezone" />
        <ComboboxPopup>
          <ComboboxEmpty>Nothing.</ComboboxEmpty>
          <ComboboxList>
            <ComboboxGroup data-testid="americas">
              <ComboboxGroupLabel>Americas</ComboboxGroupLabel>
              <ComboboxItem value="ny">New York</ComboboxItem>
              <ComboboxItem value="la">Los Angeles</ComboboxItem>
            </ComboboxGroup>
            <ComboboxGroup data-testid="europe">
              <ComboboxGroupLabel>Europe</ComboboxGroupLabel>
              <ComboboxItem value="paris">Paris</ComboboxItem>
            </ComboboxGroup>
          </ComboboxList>
        </ComboboxPopup>
      </ComboboxRoot>
    );
  }

  test("each group is named by its label, and the labels are not options", async () => {
    render(() => <Written />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();

    const groups = screen.getAllByRole("group");
    expect(
      groups.map(
        (group) =>
          document.getElementById(group.getAttribute("aria-labelledby") ?? "")?.textContent,
      ),
    ).toEqual(["Americas", "Europe"]);
    expect(optionTexts()).toEqual(["New York", "Los Angeles", "Paris"]);
    expectNoAriaViolations(document.body);
  });

  test("typing hides what does not match, and a group with nothing left says so", async () => {
    render(() => <Written />);
    user.focus(field());
    await user.type(field(), "par");
    await settle();

    expect(optionTexts()).toEqual(["Paris"]);
    expect(screen.getByTestId("americas").hasAttribute("data-empty")).toBe(true);
    expect(screen.getByTestId("europe").hasAttribute("data-empty")).toBe(false);

    user.keyDown("ArrowDown");
    expect(activeOption()?.textContent).toBe("Paris");
  });

  test("the value is the item's own, and the field shows the item's text", async () => {
    const chosen: (string | null)[] = [];
    render(() => <Written onValueChange={(value) => chosen.push(value)} />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();
    user.keyDown("ArrowDown");
    user.keyDown("Enter");
    await settle();

    expect(chosen).toEqual(["la"]);
    expect(field().value).toBe("Los Angeles");
  });
});

describe("a combobox whose data is grouped", () => {
  const ZONES = [
    { value: "Americas", items: ["New York", "Chicago"] },
    { value: "Asia", items: ["Tokyo", "Seoul"] },
  ];

  function Zones() {
    return (
      <ComboboxRoot items={ZONES}>
        <ComboboxInput aria-label="Timezone" />
        <ComboboxPopup>
          <ComboboxList>
            {(group: (typeof ZONES)[number], index: number) => (
              <ComboboxGroup items={group.items} data-index={index}>
                <ComboboxGroupLabel>{group.value}</ComboboxGroupLabel>
                <ComboboxCollection>
                  {(item: string) => <ComboboxItem value={item}>{item}</ComboboxItem>}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxPopup>
      </ComboboxRoot>
    );
  }

  test("a group renders its own items, and the arrows cross from one to the next", async () => {
    render(() => <Zones />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();

    expect(optionTexts()).toEqual(["New York", "Chicago", "Tokyo", "Seoul"]);
    expect(screen.getAllByRole("group")).toHaveLength(2);
    user.keyDown("ArrowDown");
    user.keyDown("ArrowDown");
    expect(activeOption()?.textContent).toBe("Tokyo");
  });

  test("an item whose value has spaces in it is still one the input can name", async () => {
    render(() => <Zones />);
    user.focus(field());
    user.keyDown("ArrowDown");
    await settle();

    expect(activeOption()?.textContent).toBe("New York");
    expectNoAriaViolations(document.body);
  });

  test("a group whose items all fail the filter is not rendered", async () => {
    render(() => <Zones />);
    user.focus(field());
    await user.type(field(), "seo");
    await settle();

    expect(optionTexts()).toEqual(["Seoul"]);
    expect(screen.getAllByRole("group")).toHaveLength(1);
    expect(document.querySelector("[data-index]")?.getAttribute("data-index")).toBe("0");
  });
});
