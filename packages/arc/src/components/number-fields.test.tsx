import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { accessibleName, ariaViolations, render, user } from "@barqjs/testing";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import { CurrencyField, PercentField, UnitField, numberFieldStyles } from "./number-fields.tsx";

function input(): HTMLInputElement {
  return document.querySelector('[data-slot="number-field-input"]') as HTMLInputElement;
}

describe("CurrencyField", () => {
  test("writes the amount in the locale and is named by its label", async () => {
    render(() => (
      <CurrencyField label="Price" currency="USD" defaultValue={1234.5} description="Before tax." />
    ));
    await settle();
    expect(input().value).toBe("$1,234.50");
    expect(accessibleName(input())).toBe("Price");
    const described = input().getAttribute("aria-describedby") ?? "";
    expect(described.split(" ").map((id) => document.getElementById(id)?.textContent)).toContain(
      "Before tax.",
    );
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("parses what is typed, and the arrows step it", async () => {
    const [price, setPrice] = createSignal<number | null>(null);
    render(() => (
      <CurrencyField label="Price" currency="EUR" value={price()} onChange={setPrice} />
    ));
    await settle();
    await user.type(input(), "12.5");
    input().blur();
    await settle();
    expect(price()).toBe(12.5);
    input().focus();
    await user.keyboard("{ArrowUp}");
    await settle();
    expect(price()).toBe(13);
  });

  test("in Arabic it is written in the locale's digits and currency", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <CurrencyField label="السعر" currency="EGP" defaultValue={25} />
      </Rtl>
    ));
    await settle();
    expect(input().value).toContain("٢٥");
  });
});

describe("PercentField and UnitField", () => {
  test("a percentage is held as a fraction", async () => {
    const [share, setShare] = createSignal<number | null>(0.25);
    render(() => <PercentField label="Discount" value={share()} onChange={setShare} />);
    await settle();
    expect(input().value).toBe("25%");
    input().focus();
    await user.keyboard("{ArrowUp}");
    await settle();
    expect(share()).toBe(0.26);
  });

  test("a measure is written with the locale's name for its unit", async () => {
    render(() => <UnitField label="Weight" unit="kilogram" defaultValue={12} hideSteppers />);
    await settle();
    expect(input().value).toBe("12 kg");
    const up = document.querySelector('[data-slot="number-field-increment"]') as HTMLElement;
    const hidden = numberFieldStyles({ steppers: false }).stepper;
    expect(wears(up, hidden)).toBe(true);
    const sheet = collectCss();
    function none(group: string): boolean {
      return group.split(" ").some((one) => sheet.includes(`.${one}{display:none}`));
    }
    expect(none(hidden)).toBe(true);
    expect(none(numberFieldStyles({}).stepper)).toBe(false);
  });

  test("the steppers have room for a finger and a tap steps", async () => {
    const [seats, setSeats] = createSignal<number | null>(1);
    render(() => <UnitField label="Storage" unit="gigabyte" value={seats()} onChange={setSeats} />);
    await settle();
    const up = document.querySelector('[data-slot="number-field-increment"]') as HTMLElement;
    expect(wears(up, target.size)).toBe(true);
    user.tap(up);
    await settle();
    expect(seats()).toBe(2);
  });

  test("holds the form's value inside form.AppField", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { budget: 100 } }));
      read = () => form.state.values.budget;
      return (
        <form.AppForm>
          <form.AppField name="budget">
            {(f) => <f.CurrencyField label="Budget" currency="USD" />}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    expect(input().value).toBe("$100.00");
    input().focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(read()).toBe(99);
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <PercentField
        label="Share"
        class="mine"
        classes={{ group: "g", input: "i", stepper: "s", label: "l" }}
      />
    ));
    await settle();
    function by(slot: string): Element | null {
      return document.querySelector(`[data-slot="${slot}"]`);
    }
    expect(by("percent-field")?.classList.contains("mine")).toBe(true);
    expect(by("percent-field-control")?.classList.contains("g")).toBe(true);
    expect(by("number-field-input")?.classList.contains("i")).toBe(true);
    expect(by("number-field-increment")?.classList.contains("s")).toBe(true);
    expect(by("field-label")?.classList.contains("l")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { CurrencyField, PercentField, UnitField } from "<arc>";
      export function Page() {
        return (
          <div>
            <CurrencyField label="Price" currency="USD" defaultValue={9.99} />
            <PercentField label="Share" defaultValue={0.5} />
            <UnitField label="Weight" unit="kilogram" defaultValue={3} />
          </div>
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="number-field-input"]')).toHaveLength(3);
    result.unmount();
  });
});
