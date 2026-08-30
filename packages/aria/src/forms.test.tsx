import { describe, expect, test } from "bun:test";
import { flush, signal } from "@barqjs/core";
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
    const control = screen.getByRole("switch") as HTMLInputElement;

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

    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    // One shared `name` is what makes the platform treat them as a group.
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
  });

  test("is one Tab stop", () => {
    render(() => <Sizes />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];

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
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];

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

    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    // Once there is a selection, IT is the stop, so returning to the group
    // lands on what is chosen rather than at the top.
    expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual(["-1", "0"]);
    expect(radios[1]?.checked).toBe(true);
  });

  test("clicking a label selects that radio and only that one", () => {
    render(() => <Sizes />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];

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
    const value = signal("start");
    render(() => <TextField label="Name" value={value()} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

    expect(input.value).toBe("start");

    user.type(input, "x");
    expect(input.value).toBe("start");

    value.set("next");
    flush();
    expect(input.value).toBe("next");
  });

  test("read-only keeps the value but refuses edits", () => {
    render(() => <TextField label="Name" defaultValue="fixed" isReadOnly />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

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
    const input = screen.getByRole("searchbox") as HTMLInputElement;
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
    const input = screen.getByRole("searchbox") as HTMLInputElement;

    user.click(screen.getByText("Clear search"));

    expect(input.value).toBe("");
  });
});
