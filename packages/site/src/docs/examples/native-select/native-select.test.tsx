import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import NativeSelectDemo from "./native-select-demo.tsx";
import NativeSelectDisabled from "./native-select-disabled.tsx";
import NativeSelectGroups from "./native-select-groups.tsx";
import NativeSelectInvalid from "./native-select-invalid.tsx";
import NativeSelectRtl from "./native-select-rtl.tsx";

describe("the native select examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("native-select")).toEqual([]);
  });

  test("the first option is the placeholder and the rest are the statuses", () => {
    render(() => <NativeSelectDemo />);
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Status" });
    expect(select.value).toBe("");
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Select status",
      "Todo",
      "In Progress",
      "Done",
      "Cancelled",
    ]);
  });

  test("options sit in three labelled groups", () => {
    render(() => <NativeSelectGroups />);
    expect([...document.querySelectorAll("optgroup")].map((group) => group.label)).toEqual([
      "Engineering",
      "Sales",
      "Operations",
    ]);
  });

  test("disabled and invalid are on the element", () => {
    render(() => (
      <>
        <NativeSelectDisabled />
        <NativeSelectInvalid />
      </>
    ));
    const [disabled, invalid] = screen.getAllByRole<HTMLSelectElement>("combobox");
    expect(disabled?.disabled).toBe(true);
    expect(invalid?.getAttribute("aria-invalid")).toBe("true");
  });

  test("the right-to-left select names its direction", () => {
    render(() => <NativeSelectRtl />);
    expect(screen.getByRole("combobox", { name: "الحالة" }).closest('[dir="rtl"]')).not.toBeNull();
  });
});
