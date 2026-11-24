import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { accessibleName, ariaViolations, render, screen, user } from "@barqjs/testing";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import { type Range, RangeSlider } from "./range-slider.tsx";

function thumbs(): HTMLInputElement[] {
  return screen.getAllByRole<HTMLInputElement>("slider");
}

function values(): string {
  return document.querySelector('[data-slot="range-slider-values"]')?.textContent ?? "";
}

describe("RangeSlider", () => {
  test("two thumbs, each named before the label, and the range written in the locale", async () => {
    render(() => (
      <RangeSlider
        label="Price"
        defaultValue={[20, 60]}
        formatOptions={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
      />
    ));
    await settle();
    expect(thumbs().map((thumb) => accessibleName(thumb))).toEqual([
      "Minimum Price",
      "Maximum Price",
    ]);
    expect(values()).toBe("$20 – $60");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrows move each end, and the ends never cross", async () => {
    const [range, setRange] = createSignal<Range>([10, 11]);
    render(() => <RangeSlider label="Hours" value={range()} onChange={setRange} maxValue={24} />);
    await settle();
    (thumbs()[0] as HTMLElement).focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    await settle();
    expect(range()).toEqual([11, 11]);
    (thumbs()[1] as HTMLElement).focus();
    await user.keyboard("{End}");
    await settle();
    expect(range()).toEqual([11, 24]);
  });

  test("runs from the reading direction's start", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    const [range, setRange] = createSignal<Range>([20, 60]);
    render(() => (
      <Rtl>
        <RangeSlider label="السعر" value={range()} onChange={setRange} />
      </Rtl>
    ));
    await settle();
    (thumbs()[0] as HTMLElement).focus();
    await user.keyboard("{ArrowLeft}");
    await settle();
    expect(range()).toEqual([21, 60]);
    expect(values()).toContain("٢١");
  });

  test("each thumb has room for a finger", async () => {
    render(() => <RangeSlider label="Price" />);
    await settle();
    for (const thumb of document.querySelectorAll('[data-slot="slider-thumb"]')) {
      expect(wears(thumb, target.size)).toBe(true);
    }
  });

  test("holds the form's value inside form.AppField", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { ages: [18, 30] as Range } }));
      read = () => form.state.values.ages;
      return (
        <form.AppForm>
          <form.AppField name="ages">{(f) => <f.RangeSlider label="Ages" />}</form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    (thumbs()[1] as HTMLElement).focus();
    await user.keyboard("{ArrowRight}");
    await settle();
    expect(read()).toEqual([18, 31]);
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <RangeSlider
        label="Price"
        class="mine"
        classes={{ slider: "s", track: "t", thumb: "h", values: "v", label: "l" }}
      />
    ));
    await settle();
    function by(slot: string): Element | null {
      return document.querySelector(`[data-slot="${slot}"]`);
    }
    expect(by("range-slider")?.classList.contains("mine")).toBe(true);
    expect(by("range-slider-control")?.classList.contains("s")).toBe(true);
    expect(by("slider-track")?.classList.contains("t")).toBe(true);
    expect(by("slider-thumb")?.classList.contains("h")).toBe(true);
    expect(by("range-slider-values")?.classList.contains("v")).toBe(true);
    expect(by("field-label")?.classList.contains("l")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { RangeSlider } from "<arc>";
      export function Page() {
        return <RangeSlider label="Price" defaultValue={[20, 60]} />;
      }
    `);
    expect(result.container.querySelectorAll('input[type="range"]')).toHaveLength(2);
    result.unmount();
  });
});
