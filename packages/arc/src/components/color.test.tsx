import { describe, expect, test } from "bun:test";
import { type Child, createSignal, flush } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { accessibleName, ariaViolations, render, screen, user } from "@barqjs/testing";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import {
  ColorArea,
  ColorEditor,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatches,
  colorStyles,
  colorValue,
  readColor,
} from "./color.tsx";
import { useArcForm } from "./form.tsx";

const PALETTE = ["#E11D48", "#2563EB", { color: "#16A34A", label: "Go" }];

function Rtl(props: { children?: Child }) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

async function opened(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

describe("colour values", () => {
  test("a colour is held as hex, with alpha only when it has some", () => {
    expect(colorValue(readColor("rgb(255, 0, 0)") ?? readColor("#000")!)).toBe("#ff0000");
    expect(colorValue(readColor("rgba(255, 0, 0, 0.5)")!)).toBe("#ff000080");
    expect(readColor("not a colour")).toBeNull();
    expect(readColor("")).toBeNull();
  });
});

describe("ColorSwatches", () => {
  test("is a listbox named by its label, each swatch named by its colour or its label", async () => {
    const chosen: (string | null)[] = [];
    render(() => (
      <ColorSwatches
        label="Colour"
        colors={PALETTE}
        defaultValue="#2563eb"
        onChange={(value) => chosen.push(value)}
      />
    ));
    await settle();
    const list = screen.getByRole("listbox", { name: "Colour" });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(accessibleName(options[2] as HTMLElement)).toBe("Go");
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");
    await user.click(options[0] as HTMLElement);
    await settle();
    expect(chosen).toEqual(["#e11d48"]);
    expect(list).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrows move through it in the reading direction, and Enter picks", async () => {
    const chosen: (string | null)[] = [];
    render(() => (
      <Rtl>
        <ColorSwatches
          aria-label="لون"
          colors={PALETTE}
          defaultValue="#E11D48"
          onChange={(value) => chosen.push(value)}
        />
      </Rtl>
    ));
    await settle();
    user.tab();
    expect(document.activeElement?.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowLeft}");
    await user.keyboard("{Enter}");
    await settle();
    expect(chosen.at(-1)).toBe("#2563eb");
  });

  test("a swatch has room for a finger and a tap picks it", async () => {
    const chosen: (string | null)[] = [];
    render(() => (
      <ColorSwatches aria-label="Colour" colors={PALETTE} onChange={(value) => chosen.push(value)} />
    ));
    await settle();
    const option = screen.getAllByRole("option")[1] as HTMLElement;
    expect(wears(option, target.size)).toBe(true);
    user.tap(option);
    await settle();
    expect(chosen).toEqual(["#2563eb"]);
  });
});

describe("ColorField", () => {
  test("a hex typed and committed with Enter is the value, and its chip shows it", async () => {
    const [value, setValue] = createSignal<string | null>("#000000");
    render(() => <ColorField label="Accent" value={value()} onChange={setValue} />);
    await settle();
    const input = screen.getByRole("textbox", { name: "Accent" });
    await user.clear(input);
    await user.type(input, "#7f00ff{Enter}");
    await settle();
    expect(value()).toBe("#7f00ff");
    const chip = document.querySelector('[data-slot="color-chip"]') as HTMLElement;
    expect(chip.getAttribute("aria-hidden")).toBe("true");
    expect(chip.style.backgroundColor).not.toBe("transparent");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("holds the form's value and shows its error", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { accent: "#2563EB" } }));
      read = () => form.state.values.accent;
      return (
        <form.AppForm>
          <form.AppField name="accent">{(f) => <f.ColorField label="Accent" />}</form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Accent" });
    expect(input.value.toLowerCase()).toBe("#2563eb");
    input.focus();
    await user.keyboard("{ArrowUp}");
    input.blur();
    await settle();
    expect(read()).toBe("#2563ec");
  });
});

describe("ColorArea and ColorSlider", () => {
  test("step by the arrows and report hex; the thumbs grow for a finger", async () => {
    const hues: string[] = [];
    render(() => (
      <>
        <ColorArea defaultValue="#ff0000" />
        <ColorSlider channel="hue" defaultValue="#ff0000" onChange={(value) => hues.push(value)} />
      </>
    ));
    await settle();
    const hue = screen.getByRole("slider", { name: "Hue" });
    hue.focus();
    await user.keyboard("{ArrowRight}");
    await settle();
    expect(hues.length).toBe(1);
    expect(hues[0]).not.toBe("#ff0000");
    const sheet = collectCss();
    const coarse = colorStyles()
      .thumb.split(" ")
      .some((one) => sheet.includes(`@media (pointer: coarse){.${one}{width:`));
    expect(coarse).toBe(true);
    expect(document.querySelectorAll('[data-slot="color-thumb"]')).toHaveLength(2);
  });
});

describe("ColorEditor", () => {
  test("every control is one colour: a swatch moves the hex, and the hex the value", async () => {
    const [value, setValue] = createSignal("#E11D48");
    render(() => <ColorEditor value={value()} onChange={setValue} swatches={PALETTE} alpha />);
    await settle();
    const hex = screen.getByRole<HTMLInputElement>("textbox", { name: "Hex" });
    expect(hex.value.toLowerCase()).toBe("#e11d48");
    await user.click(screen.getAllByRole("option")[1] as HTMLElement);
    await settle();
    expect(value()).toBe("#2563eb");
    expect(hex.value.toLowerCase()).toBe("#2563eb");
    expect(screen.getAllByRole("slider").map((one) => accessibleName(one))).toContain("Alpha");
  });
});

describe("ColorPicker", () => {
  test("its button is named by the label and the colour, and opens the editor", async () => {
    const [value, setValue] = createSignal<string | null>("#7F00FF");
    render(() => (
      <ColorPicker label="Brand" value={value()} onChange={setValue} swatches={PALETTE} />
    ));
    await settle();
    const trigger = document.querySelector('[data-slot="color-picker-trigger"]') as HTMLElement;
    expect(accessibleName(trigger)).toBe("Brand #7F00FF");
    trigger.focus();
    await user.keyboard("{Enter}");
    await opened();
    expect(document.querySelector('[data-slot="color-editor"]')).not.toBeNull();
    await user.click(screen.getAllByRole("option")[0] as HTMLElement);
    await settle();
    expect(value()).toBe("#e11d48");
    expect(trigger.textContent).toContain("#E11D48");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("with nothing held it says so, and a tap opens it", async () => {
    render(() => <ColorPicker label="Brand" />);
    await settle();
    const trigger = document.querySelector('[data-slot="color-picker-trigger"]') as HTMLElement;
    expect(trigger.textContent).toBe("Pick a colour");
    user.tap(trigger);
    await opened();
    expect(document.querySelector('[data-slot="color-editor"]')).not.toBeNull();
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <ColorPicker
        label="Brand"
        defaultValue="#7F00FF"
        class="mine"
        classes={{ trigger: "t", value: "v", chip: "c", label: "l" }}
      />
    ));
    await settle();
    const by = (slot: string): Element | null => document.querySelector(`[data-slot="${slot}"]`);
    expect(by("color-picker")?.classList.contains("mine")).toBe(true);
    expect(by("color-picker-trigger")?.classList.contains("t")).toBe(true);
    expect(by("color-picker-value")?.classList.contains("v")).toBe(true);
    expect(by("color-chip")?.classList.contains("c")).toBe(true);
    expect(by("field-label")?.classList.contains("l")).toBe(true);

    render(() => (
      <ColorSwatches
        aria-label="Colour"
        colors={PALETTE}
        classes={{ list: "sl", item: "si", swatch: "ss" }}
      />
    ));
    await settle();
    expect(by("color-swatches")?.classList.contains("sl")).toBe(true);
    expect(by("color-swatches-item")?.classList.contains("si")).toBe(true);
    expect(by("color-swatch")?.classList.contains("ss")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { ColorEditor, ColorField, ColorPicker, ColorSwatches } from "<arc>";
      export function Page() {
        return (
          <div>
            <ColorSwatches label="Tag" colors={["#E11D48", "#2563EB"]} defaultValue="#2563EB" />
            <ColorField label="Accent" defaultValue="#16A34A" />
            <ColorPicker label="Brand" defaultValue="#7F00FF" />
            <ColorEditor defaultValue="#7F00FF" />
          </div>
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="option"]').length).toBe(2);
    result.unmount();
  });
});
