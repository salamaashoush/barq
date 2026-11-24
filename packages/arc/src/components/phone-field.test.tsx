import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, fireEvent, render, screen, user } from "@barqjs/testing";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import { PhoneField, formatPhone, parsePhone } from "./phone-field.tsx";

function input(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox");
}

function country(): HTMLElement {
  return document.querySelector('[data-slot="phone-field-country"]') as HTMLElement;
}

describe("phone numbers", () => {
  test("E.164 from a region and what was dialled there, and back", () => {
    expect(formatPhone("EG", "0100 123 4567")).toBe("+201001234567");
    expect(formatPhone("GB", "")).toBeNull();
    expect(parsePhone("+44 20 7946 0958")).toEqual({ country: "GB", national: "2079460958" });
    expect(parsePhone("+1 416 555 0100", "CA")).toEqual({ country: "CA", national: "4165550100" });
    expect(parsePhone("+1 212 555 0100")?.country).toBe("US");
    expect(parsePhone("0100")).toBeNull();
  });
});

describe("PhoneField", () => {
  test("a dial pad input named by its label, beside a region named with its code", async () => {
    render(() => (
      <PhoneField label="Mobile" defaultCountry="EG" description="For sign-in codes." />
    ));
    await settle();
    expect(input().type).toBe("tel");
    expect(input().getAttribute("autocomplete")).toBe("tel-national");
    expect(input().labels?.[0]?.textContent).toBe("Mobile");
    expect(country().textContent).toBe("EG +20");
    expect(country().getAttribute("aria-label")).toBe("Country, Egypt");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("what is typed is held in E.164, and a + number picks its own region", async () => {
    const [phone, setPhone] = createSignal<string | null>(null);
    render(() => (
      <PhoneField label="Mobile" defaultCountry="EG" value={phone()} onChange={setPhone} />
    ));
    await settle();
    await user.type(input(), "0100 123 4567");
    await settle();
    expect(phone()).toBe("+201001234567");
    await user.clear(input());
    fireEvent.input(input(), { target: { value: "+44 20 7946 0958" } });
    await settle();
    expect(phone()).toBe("+442079460958");
    expect(country().textContent).toBe("GB +44");
  });

  test("clearing a number keeps the region it was typed in", async () => {
    const [phone, setPhone] = createSignal<string | null>("+201001234567");
    render(() => <PhoneField label="Mobile" value={phone()} onChange={setPhone} />);
    await settle();
    expect(country().textContent).toBe("EG +20");
    await user.clear(input());
    await settle();
    expect(phone()).toBeNull();
    expect(country().textContent).toBe("EG +20");
    await user.type(input(), "1001234567");
    await settle();
    expect(phone()).toBe("+201001234567");
  });

  test("choosing a region from the list keeps the number and changes its code", async () => {
    const [phone, setPhone] = createSignal<string | null>("+201001234567");
    render(() => (
      <PhoneField
        label="Mobile"
        countries={["EG", "SA", "AE"]}
        value={phone()}
        onChange={setPhone}
      />
    ));
    await settle();
    country().focus();
    await user.keyboard("{Enter}");
    await settle();
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Egypt +20", "Saudi Arabia +966", "United Arab Emirates +971"]);
    await user.click(screen.getByRole("option", { name: "Saudi Arabia +966" }));
    await settle();
    expect(phone()).toBe("+9661001234567");
  });

  test("a number too short to dial says so once the field is left", async () => {
    render(() => <PhoneField label="Mobile" defaultCountry="GB" />);
    await settle();
    await user.type(input(), "12");
    input().blur();
    await settle();
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Enter a phone number with its area code")).toBeDefined();
  });

  test("regions are named and sorted in the locale, and the region button has room for a finger", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <PhoneField label="الجوال" countries={["EG", "SA"]} />
      </Rtl>
    ));
    await settle();
    expect(country().textContent).toBe("EG +20");
    expect(wears(country(), target.size)).toBe(true);
    user.tap(country());
    await settle();
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options[0]).toContain("السعودية");
  });

  test("holds the form's value inside form.AppField, and posts it by name", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { phone: "+33142685300" } }));
      read = () => form.state.values.phone;
      return (
        <form.AppForm>
          <form.AppField name="phone">{(f) => <f.PhoneField label="Phone" />}</form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    expect(country().textContent).toBe("FR +33");
    expect(input().value).toBe("142685300");
    await user.type(input(), "1");
    await settle();
    expect(read()).toBe("+331426853001");
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <PhoneField
        label="Phone"
        class="mine"
        classes={{ control: "c", country: "k", input: "i", label: "l" }}
      />
    ));
    await settle();
    function by(slot: string): Element | null {
      return document.querySelector(`[data-slot="${slot}"]`);
    }
    expect(by("phone-field")?.classList.contains("mine")).toBe(true);
    expect(by("phone-field-control")?.classList.contains("c")).toBe(true);
    expect(by("phone-field-country")?.classList.contains("k")).toBe(true);
    expect(by("phone-field-input")?.classList.contains("i")).toBe(true);
    expect(by("field-label")?.classList.contains("l")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { PhoneField } from "<arc>";
      export function Page() {
        return <PhoneField label="Phone" name="phone" defaultValue="+442079460958" />;
      }
    `);
    expect(result.container.querySelector('input[name="phone"]')?.getAttribute("value")).toBe(
      "+442079460958",
    );
    result.unmount();
  });
});
