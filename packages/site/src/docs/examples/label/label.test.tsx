import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import FieldDemo from "./field-demo.tsx";
import LabelDemo from "./label-demo.tsx";
import LabelRtl from "./label-rtl.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the label examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("label")).toEqual([]);
  });

  test("a press on the label ticks the checkbox it is for", async () => {
    render(() => <LabelDemo />);
    const box = screen.getByRole("checkbox", { name: "Accept terms and conditions" });
    expect((box as HTMLInputElement).checked).toBe(false);

    await user.click(screen.getByText("Accept terms and conditions"));
    flush();
    expect((box as HTMLInputElement).checked).toBe(true);
  });

  test("each field label names its control", async () => {
    render(() => <FieldDemo />);
    expect(screen.getByLabelText("Name on Card").getAttribute("placeholder")).toBe("Salama");
    expect(screen.getByLabelText("Comments").tagName).toBe("TEXTAREA");
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Same as shipping address" }).checked,
    ).toBe(true);

    const month = screen.getByRole("combobox", { name: "Month" });
    await user.click(month);
    await settle();
    expect(screen.getAllByRole("option")).toHaveLength(12);

    await user.click(screen.getByRole("option", { name: "07" }));
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(month.textContent).toContain("07");
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <LabelRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="label"]')?.textContent).toBe(
      "قبول الشروط والأحكام",
    );
  });
});
