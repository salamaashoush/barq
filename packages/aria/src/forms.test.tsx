import { describe, expect, test } from "bun:test";
import { flush, createSignal } from "@barqjs/core";
import {
  accessibleDescription,
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tabbableElements,
  user,
} from "@barqjs/testing";
import { Switch } from "./switch.tsx";
import { Radio, RadioGroup } from "./radio.tsx";
import { Link, Meter, ProgressBar, Separator } from "./link.tsx";
import { Autocomplete, type AutocompleteFilter } from "./autocomplete.tsx";
import type { Key } from "./collections.ts";
import { Form } from "./form.tsx";
import { ListBox, Option } from "./listbox.tsx";
import { SearchField, TextField } from "./textfield.tsx";

describe("Switch", () => {
  test("is a switch, not a checkbox", () => {
    render(() => <Switch>Wi-Fi</Switch>);
    const control = screen.getByRole("switch");
    expect(accessibleName(control)).toBe("Wi-Fi");
    expect(control.getAttribute("aria-checked")).toBeNull();
    expect((control as HTMLInputElement).checked).toBe(false);
  });

  test("toggles on a press of its label", () => {
    const changes: boolean[] = [];
    render(() => <Switch onChange={(on) => changes.push(on)}>Wi-Fi</Switch>);
    const control = screen.getByRole<HTMLInputElement>("switch");

    user.click(control.parentElement as HTMLElement);
    expect(changes).toEqual([true]);
    expect(control.checked).toBe(true);
  });
});

describe("RadioGroup", () => {
  function Sizes() {
    return (
      <RadioGroup label="Size" data-testid="sizes">
        <Radio value="s">Small</Radio>
        <Radio value="m">Medium</Radio>
        <Radio value="l">Large</Radio>
      </RadioGroup>
    );
  }

  test("is a radiogroup with a name, holding real radios", () => {
    render(() => <Sizes />);
    const group = screen.getByRole("radiogroup");
    expect(accessibleName(group)).toBe("Size");

    const radios = screen.getAllByRole<HTMLInputElement>("radio");
    expect(radios).toHaveLength(3);
    // One shared `name` is what makes the platform treat them as a group.
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
  });

  test("is one Tab stop", () => {
    render(() => <Sizes />);
    const radios = screen.getAllByRole<HTMLInputElement>("radio");

    // With nothing selected the platform's own grouping decides, and it stops
    // at the first radio of a `name`; the roving index only has to avoid
    // REMOVING radios from the order.
    expect(tabbableElements().filter((el) => el.getAttribute("type") === "radio")).toEqual([
      radios[0] as HTMLElement,
    ]);
  });

  test("the arrows move AND select, and wrap", () => {
    const values: string[] = [];
    render(() => (
      <RadioGroup label="Size" onChange={(v) => values.push(v)}>
        <Radio value="s">Small</Radio>
        <Radio value="m">Medium</Radio>
        <Radio value="l">Large</Radio>
      </RadioGroup>
    ));
    const radios = screen.getAllByRole<HTMLInputElement>("radio");

    radios[0]?.focus();
    user.keyDown("ArrowDown");
    expect(values).toEqual(["m"]);
    expect(document.activeElement).toBe(radios[1] as HTMLElement);

    user.keyDown("ArrowDown");
    expect(values).toEqual(["m", "l"]);

    // The group is a ring.
    user.keyDown("ArrowDown");
    expect(values).toEqual(["m", "l", "s"]);
  });

  test("the selected radio becomes the tab stop", () => {
    render(() => (
      <RadioGroup label="Size" defaultValue="m">
        <Radio value="s">Small</Radio>
        <Radio value="m">Medium</Radio>
      </RadioGroup>
    ));

    const radios = screen.getAllByRole<HTMLInputElement>("radio");
    // Once there is a selection, IT is the stop, so returning to the group
    // lands on what is chosen rather than at the top.
    expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual(["-1", "0"]);
    expect(radios[1]?.checked).toBe(true);
  });

  test("clicking a label selects that radio and only that one", () => {
    render(() => <Sizes />);
    const radios = screen.getAllByRole<HTMLInputElement>("radio");

    user.click(radios[1]?.parentElement as HTMLElement);

    expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
  });

  test("disabling the group disables every radio", () => {
    render(() => (
      <RadioGroup label="Size" isDisabled>
        <Radio value="s">Small</Radio>
      </RadioGroup>
    ));
    expect(screen.getByRole<HTMLInputElement>("radio").disabled).toBe(true);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Sizes />);
    expectNoAriaViolations(container);
  });
});

describe("Link", () => {
  test("a click handler hears one click per click", async () => {
    let clicks = 0;
    render(() => (
      <Link href="#about" onClick={() => clicks++}>
        About
      </Link>
    ));
    await user.click(screen.getByRole("link", { name: "About" }));
    expect(clicks).toBe(1);
  });

  test("is an anchor with an href", () => {
    render(() => <Link href="/about">About</Link>);
    const link = screen.getByRole("link", { name: "About" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/about");
  });

  test("Enter presses it, Space does not", () => {
    const presses: string[] = [];
    render(() => (
      <Link href="/about" onPress={() => presses.push("press")}>
        About
      </Link>
    ));
    const link = screen.getByRole("link");
    link.focus();

    user.key(" ");
    expect(presses).toEqual([]);

    user.key("Enter");
    expect(presses).toEqual(["press"]);
  });

  test("disabled says so and drops the href", () => {
    render(() => (
      <Link href="/about" isDisabled>
        About
      </Link>
    ));
    const link = screen.getByText("About");
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.hasAttribute("href")).toBe(false);
  });
});

describe("Separator", () => {
  test("an hr needs no role", () => {
    render(() => <Separator data-testid="sep" />);
    const sep = screen.getByTestId("sep");
    expect(sep.tagName).toBe("HR");
    expect(sep.hasAttribute("role")).toBe(false);
    expect(sep.hasAttribute("aria-orientation")).toBe(false);
  });

  test("a vertical one has to say so", () => {
    render(() => <Separator orientation="vertical" data-testid="sep" />);
    expect(screen.getByTestId("sep").getAttribute("aria-orientation")).toBe("vertical");
  });

  test("a decorative one is drawn and not announced", () => {
    render(() => <Separator decorative orientation="vertical" data-testid="sep" />);
    const sep = screen.getByTestId("sep");
    expect(sep.getAttribute("role")).toBe("none");
    expect(sep.hasAttribute("aria-orientation")).toBe(false);
    // The stylesheet still needs to know which way to draw it.
    expect(sep.getAttribute("data-orientation")).toBe("vertical");
    expect(screen.queryByRole("separator")).toBeNull();
  });
});

describe("ProgressBar", () => {
  test("reports its value and range", () => {
    render(() => <ProgressBar label="Uploading" value={30} />);
    const bar = screen.getByRole("progressbar");

    expect(accessibleName(bar)).toBe("Uploading");
    expect(bar.getAttribute("aria-valuenow")).toBe("30");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuetext")).toBe("30%");
  });

  test("an indeterminate bar reports no value at all", () => {
    render(() => <ProgressBar label="Loading" isIndeterminate />);
    const bar = screen.getByRole("progressbar");

    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.hasAttribute("aria-valuetext")).toBe(false);
  });

  test("the value is clamped to the range", () => {
    render(() => <ProgressBar label="Uploading" value={500} maxValue={100} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  test("a custom format is used for the value text", () => {
    render(() => (
      <ProgressBar label="Downloaded" value={3} maxValue={4} formatOptions={{ style: "decimal" }} />
    ));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("3");
  });
});

describe("Meter", () => {
  test("falls back from meter to progressbar", () => {
    render(() => <Meter label="Storage" value={80} />);
    const meter = screen.getByRole("meter");
    expect(meter.getAttribute("role")).toBe("meter progressbar");
    expect(meter.getAttribute("aria-valuenow")).toBe("80");
  });
});

describe("TextField", () => {
  test("the label, description and error are all announced with the input", () => {
    render(() => (
      <TextField
        label="Email"
        description="We will not share it"
        errorMessage="Not an email"
        isInvalid
      />
    ));

    const input = screen.getByRole("textbox");
    expect(accessibleName(input)).toBe("Email");
    expect(accessibleDescription(input)).toBe("We will not share it Not an email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  test("the error is not announced while the field is valid", () => {
    render(() => <TextField label="Email" errorMessage="Not an email" />);
    expect(accessibleDescription(screen.getByRole("textbox"))).toBe("");
  });

  test("typing reports the value", () => {
    const values: string[] = [];
    render(() => <TextField label="Name" onChange={(v) => values.push(v)} />);

    user.type(screen.getByRole("textbox"), "ab");

    expect(values).toEqual(["a", "ab"]);
  });

  test("controlled: the prop owns the value", () => {
    const [value, setValue] = createSignal("start");
    render(() => <TextField label="Name" value={value()} />);
    const input = screen.getByRole<HTMLInputElement>("textbox");

    expect(input.value).toBe("start");

    user.type(input, "x");
    expect(input.value).toBe("start");

    setValue("next");
    flush();
    expect(input.value).toBe("next");
  });

  test("read-only keeps the value but refuses edits", () => {
    render(() => <TextField label="Name" defaultValue="fixed" isReadOnly />);
    const input = screen.getByRole<HTMLInputElement>("textbox");

    expect(input.readOnly).toBe(true);
    expect(input.value).toBe("fixed");
  });

  test("multi-line renders a textarea", () => {
    render(() => <TextField label="Bio" isMultiLine />);
    expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <TextField label="Email" description="Help" />);
    expectNoAriaViolations(container);
  });
});

describe("SearchField", () => {
  test("is a searchbox", () => {
    render(() => <SearchField label="Search" />);
    expect(screen.getByRole("searchbox")).toBeDefined();
  });

  test("Enter submits and Escape clears", () => {
    const submits: string[] = [];
    render(() => (
      <SearchField label="Search" defaultValue="cat" onSubmit={(q) => submits.push(q)} />
    ));
    const input = screen.getByRole<HTMLInputElement>("searchbox");
    input.focus();

    user.keyDown("Enter");
    expect(submits).toEqual(["cat"]);

    user.keyDown("Escape");
    expect(input.value).toBe("");
  });

  test("the clear button is not a Tab stop", () => {
    render(() => <SearchField label="Search" defaultValue="cat" />);
    const clear = screen.getByText("Clear search");
    expect(clear.getAttribute("tabindex")).toBe("-1");
    expect(clear.getAttribute("aria-hidden")).toBe("true");
  });

  test("the clear button empties the field", () => {
    render(() => <SearchField label="Search" defaultValue="cat" />);
    const input = screen.getByRole<HTMLInputElement>("searchbox");

    user.click(screen.getByText("Clear search"));

    expect(input.value).toBe("");
  });
});

describe("TextField, required", () => {
  test("under aria it does not block the submit", () => {
    render(() => (
      <Form aria-label="Account">
        <TextField label="Email" name="email" isRequired />
      </Form>
    ));
    const input = screen.getByRole<HTMLInputElement>("textbox");
    expect(input.required).toBe(false);
    expect(input.getAttribute("aria-required")).toBe("true");
    expect(screen.getByRole<HTMLFormElement>("form").checkValidity()).toBe(true);
  });

  test("says read-only and required to a stylesheet", () => {
    render(() => <TextField label="Email" isReadOnly isRequired />);
    const input = screen.getByRole("textbox");
    expect(input.hasAttribute("data-readonly")).toBe(true);
    expect(input.hasAttribute("data-required")).toBe(true);
  });
});

describe("SearchField, keys", () => {
  test("Escape that clears the field goes no further", () => {
    const outside: string[] = [];
    render(() => (
      <div onKeyDown={(event: KeyboardEvent) => outside.push(event.key)}>
        <SearchField label="Search" defaultValue="cat" />
      </div>
    ));
    const input = screen.getByRole<HTMLInputElement>("searchbox");
    input.focus();

    user.keyDown("Escape");

    expect(input.value).toBe("");
    expect(outside).toEqual([]);
  });

  test("Escape in an empty field is left to whatever is around it", () => {
    const outside: string[] = [];
    render(() => (
      <div onKeyDown={(event: KeyboardEvent) => outside.push(event.key)}>
        <SearchField label="Search" onClear={() => {}} />
      </div>
    ));
    screen.getByRole<HTMLInputElement>("searchbox").focus();

    user.keyDown("Escape");

    expect(outside).toEqual(["Escape"]);
  });

  test("Enter without onSubmit is the form's, and submits it", () => {
    render(() => (
      <form>
        <SearchField label="Search" name="q" />
      </form>
    ));
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    screen.getByRole("searchbox").dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
  });

  test("Enter with onSubmit is the field's", () => {
    render(() => <SearchField label="Search" onSubmit={() => {}} />);
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    screen.getByRole("searchbox").dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
  });

  test("says invalid, read-only and required to a stylesheet", () => {
    render(() => <SearchField label="Search" isInvalid isReadOnly isRequired />);
    const input = screen.getByRole("searchbox");
    expect(input.hasAttribute("data-invalid")).toBe(true);
    expect(input.hasAttribute("data-readonly")).toBe(true);
    expect(input.hasAttribute("data-required")).toBe(true);
  });
});

describe("a field inside an Autocomplete", () => {
  interface Fruit {
    id: string;
    name: string;
  }

  const FRUITS: Fruit[] = [
    { id: "apple", name: "Apple" },
    { id: "apricot", name: "Apricot" },
    { id: "banana", name: "Banana" },
  ];

  const contains: AutocompleteFilter = (textValue, inputValue) =>
    textValue.toLowerCase().includes(inputValue.toLowerCase());

  function Fruits(props: { onAction?: (key: Key) => void }) {
    return (
      <ListBox items={FRUITS} getTextValue={(fruit: Fruit) => fruit.name} onAction={props.onAction}>
        {(fruit: Fruit) => <Option>{fruit.name}</Option>}
      </ListBox>
    );
  }

  const names = (): string[] =>
    screen.getAllByRole("option").map((option) => option.textContent ?? "");

  test("a SearchField filters the list and controls it", () => {
    const changes: string[] = [];
    render(() => (
      <Autocomplete filter={contains}>
        <SearchField label="Fruit" onChange={(value) => changes.push(value)} />
        <Fruits />
      </Autocomplete>
    ));
    flush();
    const input = screen.getByRole<HTMLInputElement>("searchbox");

    expect(input.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    expect(input.getAttribute("aria-autocomplete")).toBe("list");

    user.type(input, "ap");
    flush();

    expect(names()).toEqual(["Apple", "Apricot"]);
    // The caller still hears every change, after the autocomplete has.
    expect(changes).toEqual(["a", "ap"]);
  });

  test("the arrows highlight options while focus stays in the SearchField", () => {
    const acted: Key[] = [];
    render(() => (
      <Autocomplete filter={contains}>
        <SearchField label="Fruit" />
        <Fruits onAction={(key) => acted.push(key)} />
      </Autocomplete>
    ));
    flush();
    const input = screen.getByRole<HTMLInputElement>("searchbox");

    user.focus(input);
    user.keyDown("ArrowDown");
    flush();

    const apple = screen.getByRole("option", { name: "Apple" });
    expect(input.getAttribute("aria-activedescendant")).toBe(apple.id);
    expect(document.activeElement).toBe(input);

    user.key("Enter");
    flush();
    expect(acted).toEqual(["apple"]);
  });

  test("Escape in the SearchField clears the query and shows the whole list", () => {
    render(() => (
      <Autocomplete filter={contains} defaultInputValue="ban">
        <SearchField label="Fruit" />
        <Fruits />
      </Autocomplete>
    ));
    flush();
    const input = screen.getByRole<HTMLInputElement>("searchbox");
    expect(input.value).toBe("ban");
    expect(names()).toEqual(["Banana"]);

    input.focus();
    user.keyDown("Escape");
    flush();

    expect(input.value).toBe("");
    expect(names()).toHaveLength(3);
  });

  test("a TextField works the same way", () => {
    const changes: string[] = [];
    render(() => (
      <Autocomplete filter={contains}>
        <TextField label="Fruit" onChange={(value) => changes.push(value)} />
        <Fruits />
      </Autocomplete>
    ));
    flush();
    const input = screen.getByRole<HTMLInputElement>("textbox");

    expect(input.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);

    user.type(input, "ban");
    flush();

    expect(names()).toEqual(["Banana"]);
    expect(changes).toEqual(["b", "ba", "ban"]);
  });

  test("outside an Autocomplete nothing is added", () => {
    render(() => <SearchField label="Fruit" />);
    const input = screen.getByRole("searchbox");
    expect(input.hasAttribute("aria-controls")).toBe(false);
    expect(input.hasAttribute("aria-autocomplete")).toBe(false);
  });
});
