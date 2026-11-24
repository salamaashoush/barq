import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  user,
  within,
} from "@barqjs/testing";
import type { Color } from "./color.ts";
import { ColorSwatch } from "./colorpicker.tsx";
import {
  ColorSwatchPicker,
  type ColorSwatchPickerComponentProps,
  ColorSwatchPickerItem,
  useColorSwatchPickerItem,
} from "./colorswatchpicker.tsx";

const COLOURS = ["#f00", "#0f0", "#0ff", "#00f"];

interface SwatchesProps {
  disabled?: string;
}

function Swatches(props: Omit<ColorSwatchPickerComponentProps, "children"> & SwatchesProps) {
  return (
    <ColorSwatchPicker {...props}>
      {COLOURS.map((hex) => (
        <ColorSwatchPickerItem color={hex} isDisabled={props.disabled === hex}>
          {(color: Color) => <ColorSwatch color={color} />}
        </ColorSwatchPickerItem>
      ))}
    </ColorSwatchPicker>
  );
}

function options(): HTMLElement[] {
  return within(screen.getByRole("listbox")).getAllByRole("option");
}

function selected(): (string | null)[] {
  return options().map((option) => option.getAttribute("aria-selected"));
}

/** Lay the swatches out two to a row, as a stylesheet would. */
function asGrid(): void {
  const list = screen.getByRole("listbox");
  list.getBoundingClientRect = () => ({ left: 0, top: 0, width: 40, height: 40 }) as DOMRect;
  for (const [index, option] of options().entries()) {
    const left = (index % 2) * 20;
    const top = Math.floor(index / 2) * 20;
    option.getBoundingClientRect = () => ({ left, top, width: 20, height: 20 }) as DOMRect;
  }
}

describe("ColorSwatchPicker", () => {
  test("is a listbox of swatches, named by default", () => {
    render(() => <Swatches />);

    const listbox = screen.getByRole("listbox");
    expect(listbox.getAttribute("aria-label")).toBe("Color swatches");
    expect(listbox.getAttribute("data-layout")).toBe("grid");
    expect(options()).toHaveLength(4);
    expect(accessibleName(options()[0] as HTMLElement)).toBe("vibrant red");
    expect(within(options()[0] as HTMLElement).getByRole("img")).not.toBeNull();
    expectNoAriaViolations(document.body);
  });

  test("aria-label and aria-labelledby replace the default name", () => {
    render(() => (
      <>
        <Swatches aria-label="Brand" data-testid="labelled" />
        <span id="heading">Accent</span>
        <Swatches aria-labelledby="heading" data-testid="referenced" />
      </>
    ));

    expect(screen.getByTestId("labelled").getAttribute("aria-label")).toBe("Brand");
    const referenced = screen.getByTestId("referenced");
    expect(referenced.getAttribute("aria-labelledby")).toBe("heading");
    expect(referenced.hasAttribute("aria-label")).toBe(false);
  });

  test("a click selects a swatch and reports its colour", () => {
    const seen: Color[] = [];
    render(() => <Swatches onChange={(color) => seen.push(color)} />);

    user.click(options()[1] as HTMLElement);
    flush();

    expect(seen).toHaveLength(1);
    expect(seen[0]?.toString("hex")).toBe("#00ff00");
    expect(selected()).toEqual(["false", "true", "false", "false"]);
    expect(options()[1]?.hasAttribute("data-selected")).toBe(true);
  });

  test("the default value is selected", () => {
    render(() => <Swatches defaultValue="#0ff" />);
    expect(selected()).toEqual(["false", "false", "true", "false"]);
  });

  test("a value written another way is the same colour", () => {
    render(() => <Swatches defaultValue="rgb(0, 0, 255)" />);
    expect(selected()).toEqual(["false", "false", "false", "true"]);
  });

  test("a value matching no swatch selects nothing", () => {
    render(() => <Swatches defaultValue="#123456" />);
    expect(selected()).toEqual(["false", "false", "false", "false"]);
  });

  test("controlled, it shows what it is given", () => {
    const [value, setValue] = createSignal("#f00");
    const seen: string[] = [];
    render(() => (
      <Swatches value={value()} onChange={(color) => seen.push(color.toString("hex"))} />
    ));

    user.click(options()[3] as HTMLElement);
    flush();
    expect(seen).toEqual(["#0000ff"]);
    expect(selected()).toEqual(["true", "false", "false", "false"]);

    setValue("#00f");
    flush();
    expect(selected()).toEqual(["false", "false", "false", "true"]);
  });

  test("the selected swatch cannot be unselected", () => {
    const seen: Color[] = [];
    render(() => <Swatches defaultValue="#f00" onChange={(color) => seen.push(color)} />);

    user.click(options()[0] as HTMLElement);
    flush();

    expect(seen).toHaveLength(0);
    expect(selected()[0]).toBe("true");
  });

  test("Tab enters on the first swatch, the arrows move, Enter selects", () => {
    render(() => <Swatches />);
    asGrid();

    user.tab();
    expect(document.activeElement).toBe(options()[0] as HTMLElement);

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(options()[1] as HTMLElement);

    user.key("Enter");
    flush();
    expect(selected()[1]).toBe("true");
  });

  test("Tab enters on the selected swatch", () => {
    render(() => <Swatches defaultValue="#0ff" />);
    user.tab();
    expect(document.activeElement).toBe(options()[2] as HTMLElement);
  });

  test("typing a colour's name moves to it", () => {
    render(() => <Swatches />);
    user.tab();

    user.key("d");
    flush();

    expect(document.activeElement).toBe(options()[3] as HTMLElement);
  });

  test("a stack is a single column", () => {
    render(() => <Swatches layout="stack" />);
    expect(screen.getByRole("listbox").getAttribute("data-layout")).toBe("stack");

    user.tab();
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(options()[1] as HTMLElement);
  });

  test("a disabled swatch is skipped and cannot be chosen", () => {
    const seen: Color[] = [];
    render(() => <Swatches disabled="#0f0" onChange={(color) => seen.push(color)} />);
    asGrid();

    expect(options()[1]?.getAttribute("aria-disabled")).toBe("true");
    user.click(options()[1] as HTMLElement);
    flush();
    expect(seen).toHaveLength(0);

    user.tab();
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(options()[2] as HTMLElement);
  });

  test("an item's class, style and children reach its option", () => {
    function Hex() {
      const color = useColorSwatchPickerItem();
      return <span data-testid="hex">{color?.().toString("hex")}</span>;
    }
    render(() => (
      <ColorSwatchPicker class="picker">
        <ColorSwatchPickerItem color="#f00" class="item" data-slot="swatch">
          <Hex />
        </ColorSwatchPickerItem>
      </ColorSwatchPicker>
    ));

    expect(screen.getByRole("listbox").getAttribute("class")).toBe("picker");
    const option = options()[0] as HTMLElement;
    expect(option.getAttribute("class")).toBe("item");
    expect(option.getAttribute("data-slot")).toBe("swatch");
    expect(screen.getByTestId("hex").textContent).toBe("#ff0000");
  });

  test("an item outside a picker is a mistake that says so", () => {
    expect(() => render(() => <ColorSwatchPickerItem color="#f00" />)).toThrow(/ColorSwatchPicker/);
  });
});
