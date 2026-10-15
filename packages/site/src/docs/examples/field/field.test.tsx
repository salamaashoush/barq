import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import FieldCheckbox from "./field-checkbox.tsx";
import FieldChoiceCard from "./field-choice-card.tsx";
import FieldDemo from "./field-demo.tsx";
import FieldGroupExample from "./field-group.tsx";
import FieldInput from "./field-input.tsx";
import FieldRadio from "./field-radio.tsx";
import FieldResponsive from "./field-responsive.tsx";
import FieldRtl from "./field-rtl.tsx";
import FieldSelect from "./field-select.tsx";
import FieldSlider from "./field-slider.tsx";
import FieldSwitch from "./field-switch.tsx";
import FieldValidation from "./field-validation.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const checkbox = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;

describe("the field examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("field")).toEqual([]);
  });

  test("the payment form's labels name its controls, and its month list has twelve options", async () => {
    render(() => <FieldDemo />);
    await settle();
    expect(screen.getByLabelText("Name on Card").getAttribute("placeholder")).toBe("Salama");

    const shipping = checkbox("field-demo-same-as-shipping");
    expect(shipping.checked).toBe(true);
    await user.click(shipping);
    flush();
    expect(shipping.checked).toBe(false);

    await user.click(screen.getByRole("combobox", { name: "Month" }));
    await settle();
    expect(screen.getAllByRole("option")).toHaveLength(12);
    await user.click(screen.getByRole("option", { name: "07" }));
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Month" }).textContent).toBe("07");
  });

  test("a description sits on either side of its control", () => {
    render(() => <FieldInput />);
    const username = screen.getByLabelText("Username");
    const password = screen.getByLabelText("Password");
    expect(username.nextElementSibling?.getAttribute("data-slot")).toBe("field-description");
    expect(password.previousElementSibling?.getAttribute("data-slot")).toBe("field-description");
  });

  test("the department select shows what was chosen", async () => {
    render(() => <FieldSelect />);
    await settle();
    const trigger = screen.getByRole("combobox", { name: "Department" });
    expect(trigger.textContent).toBe("Choose department");

    await user.click(trigger);
    await settle();
    expect(screen.getAllByRole("option")).toHaveLength(8);
    await user.click(screen.getByRole("option", { name: "Design" }));
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger.textContent).toBe("Design");
  });

  test("the description follows the slider's two thumbs", () => {
    render(() => <FieldSlider />);
    const description = document.querySelector('[data-slot="field-description"]');
    expect(description?.textContent).toBe("Set your budget range ($200 - 800).");

    const thumbs = screen.getAllByRole("slider");
    user.focus(thumbs[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(description?.textContent).toBe("Set your budget range ($210 - 800).");

    user.focus(thumbs[1] as HTMLElement);
    user.keyDown("ArrowLeft");
    flush();
    expect(description?.textContent).toBe("Set your budget range ($210 - 790).");
  });

  test("a checkbox beside its label toggles, and the synced one starts checked", async () => {
    render(() => <FieldCheckbox />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    expect(checkbox("field-checkbox-sync-folders").checked).toBe(true);

    const disks = screen.getByLabelText("Hard disks") as HTMLInputElement;
    expect(disks.checked).toBe(false);
    await user.click(disks);
    flush();
    expect(disks.checked).toBe(true);
  });

  test("choosing a plan takes the choice off the one before", async () => {
    render(() => <FieldRadio />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((radio) => radio.checked)).toEqual([true, false, false]);

    await user.click(radios[1] as HTMLElement);
    flush();
    expect(radios.map((radio) => radio.checked)).toEqual([false, true, false]);
  });

  test("the switch is named by its label and turns on", async () => {
    render(() => <FieldSwitch />);
    const control = screen.getByRole("switch", {
      name: "Multi-factor authentication",
    }) as HTMLInputElement;
    expect(control.checked).toBe(false);
    await user.click(control);
    flush();
    expect(control.checked).toBe(true);
  });

  test("a choice card is a label around its field, and choosing the radio inside selects it", async () => {
    render(() => <FieldChoiceCard />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((radio) => radio.checked)).toEqual([true, false]);
    for (const radio of radios) {
      expect(radio.closest('[data-slot="field-label"]')?.tagName.toLowerCase()).toBe("label");
    }

    await user.click(radios[1] as HTMLElement);
    flush();
    expect(radios.map((radio) => radio.checked)).toEqual([false, true]);
  });

  test("a checkbox group is a field group under another slot name, and its locked box stays checked", async () => {
    render(() => <FieldGroupExample />);
    expect(document.querySelectorAll('[data-slot="checkbox-group"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="field-separator"]')).toHaveLength(1);

    const locked = checkbox("field-group-push");
    expect(locked.disabled).toBe(true);
    expect(locked.checked).toBe(true);

    const email = checkbox("field-group-email-tasks");
    await user.click(email);
    flush();
    expect(email.checked).toBe(true);
  });

  test("a responsive field says so, inside the group it measures itself against", () => {
    render(() => <FieldResponsive />);
    const fields = [...document.querySelectorAll('[data-slot="field"]')];
    expect(fields.map((field) => field.getAttribute("data-orientation"))).toEqual([
      "responsive",
      "responsive",
    ]);
    expect(fields.every((field) => field.closest('[data-slot="field-group"]') !== null)).toBe(true);
  });

  test("an invalid field reports its error once, and a disabled one says it is disabled", () => {
    render(() => <FieldValidation />);
    expect(screen.getByRole("alert").textContent).toBe("That card was declined.");
    expect(screen.getByLabelText("Card").getAttribute("aria-invalid")).toBe("true");

    const fields = [...document.querySelectorAll('[data-slot="field"]')];
    expect(fields.map((field) => field.hasAttribute("data-invalid"))).toEqual([true, false]);
    expect(fields.map((field) => field.hasAttribute("data-disabled"))).toEqual([false, true]);
    expect(document.querySelector('[data-slot="field-separator-content"]')?.textContent).toBe("or");
  });

  test("the right-to-left example names its direction on an element and on its lists", async () => {
    render(() => <FieldRtl />);
    await settle();
    expect(document.querySelector('[dir="rtl"] [data-slot="field-set"]')).not.toBeNull();

    const month = screen.getByRole("combobox", { name: "الشهر" });
    expect(month.textContent).toBe("ش.ش");
    await user.click(month);
    await settle();
    expect(document.querySelector('[data-slot="select-content"]')?.getAttribute("dir")).toBe("rtl");
    expect(screen.getAllByRole("option")).toHaveLength(12);
    await user.click(screen.getByRole("option", { name: "٠٣" }));
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(month.textContent).toBe("٠٣");
  });
});
