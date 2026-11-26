import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { accessibleDescription, ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { ColorField, ColorPicker, contrastRatio } from "./color.tsx";
import { useArcForm } from "./form.tsx";
import { type NumberPair, OptionalLimitField, PairedNumberField } from "./limit-fields.tsx";

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

function amount(name: string): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox", { name });
}

interface JobsValues {
  jobs: number | null;
}

describe("OptionalLimitField", () => {
  test("a switch turns the limit on; the number sits in the sentence and is null while off", async () => {
    const [minutes, setMinutes] = createSignal<number | null>(null);
    render(() => (
      <OptionalLimitField
        label="Offline alert"
        amountLabel="Minutes"
        sentence={(part) => `Alert when no runner is online for ${part} minutes`}
        defaultAmount={10}
        minValue={1}
        value={minutes()}
        onChange={setMinutes}
      />
    ));
    await settle();
    const toggle = screen.getByRole("switch", { name: "Offline alert" });
    expect(amount("Minutes").disabled).toBe(true);
    expect(document.querySelector('[data-slot="optional-limit-sentence"]')?.textContent).toContain(
      "Alert when no runner is online for",
    );
    await user.click(toggle);
    await settle();
    expect(minutes()).toBe(10);
    expect(amount("Minutes").disabled).toBe(false);
    await user.clear(amount("Minutes"));
    await user.type(amount("Minutes"), "25");
    amount("Minutes").blur();
    await settle();
    expect(minutes()).toBe(25);
    await user.click(toggle);
    await settle();
    expect(minutes()).toBeNull();
    await user.click(toggle);
    await settle();
    expect(minutes()).toBe(25);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("blank mode: no switch, and an empty number is no limit", async () => {
    const [cap, setCap] = createSignal<number | null>(40);
    render(() => (
      <OptionalLimitField
        label="Spend limit"
        mode="blank"
        amountLabel="Dollars a month"
        sentence={(part) => `Stop at ${part} a month`}
        formatOptions={{ style: "currency", currency: "USD" }}
        value={cap()}
        onChange={setCap}
      />
    ));
    await settle();
    expect(screen.queryByRole("switch")).toBeNull();
    const input = amount("Dollars a month");
    expect(input.placeholder).toBe("No limit");
    await user.type(input, "{Backspace}".repeat(input.value.length));
    input.blur();
    await settle();
    expect(cap()).toBeNull();
  });

  test("holds the form's value inside form.AppField, in a right-to-left form", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const defaults: JobsValues = { jobs: 4 };
      const form = useArcForm(() => ({ defaultValues: defaults }));
      read = () => form.state.values.jobs;
      return (
        <Rtl>
          <form.AppForm>
            <form.AppField name="jobs">
              {(field) => (
                <field.OptionalLimitField
                  label="Concurrency"
                  amountLabel="Jobs"
                  sentence={(part) => `Run at most ${part} jobs at once`}
                />
              )}
            </form.AppField>
          </form.AppForm>
        </Rtl>
      );
    });
    await settle();
    expect(amount("Jobs").value).toBe("٤");
    await user.click(screen.getByRole("switch"));
    await settle();
    expect(read()).toBeNull();
  });
});

describe("PairedNumberField", () => {
  test("two numbers as one value, each named, null while both are empty", async () => {
    const [size, setSize] = createSignal<NumberPair | null>(null);
    render(() => (
      <PairedNumberField
        label="Viewport"
        labels={["Width", "Height"]}
        unit="pixels"
        value={size()}
        onChange={setSize}
      />
    ));
    await settle();
    expect(screen.getByRole("group", { name: "Viewport" })).toBeDefined();
    await user.type(amount("Width"), "1280");
    amount("Width").blur();
    await settle();
    expect(size()).toBeNull();
    expect(screen.getByText("Fill in both, or leave both empty.")).toBeDefined();
    expect(accessibleDescription(amount("Height"))).toBe("Fill in both, or leave both empty.");
    await user.type(amount("Height"), "720");
    amount("Height").blur();
    await settle();
    expect(size()).toEqual([1280, 720]);
    expect(screen.queryByText("Fill in both, or leave both empty.")).toBeNull();
    expect(screen.getByText("pixels")).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("shows a held pair, and holds the form's value", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({
        defaultValues: { place: [30.04, 31.23] as NumberPair | null },
      }));
      read = () => form.state.values.place;
      return (
        <form.AppForm>
          <form.AppField name="place">
            {(field) => (
              <field.PairedNumberField
                label="Location"
                labels={["Latitude", "Longitude"]}
                separator=","
              />
            )}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    expect(amount("Latitude").value).toBe("30.04");
    await user.clear(amount("Longitude"));
    await user.type(amount("Longitude"), "31.5");
    amount("Longitude").blur();
    await settle();
    expect(read()).toEqual([30.04, 31.5]);
  });
});

describe("colour contrast", () => {
  test("contrastRatio follows WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
    expect(contrastRatio("not a colour", "#ffffff")).toBeNull();
  });

  test("a colour that reads poorly against a target says so under the field", async () => {
    const [accent, setAccent] = createSignal<string | null>("#3b82f6");
    render(() => (
      <ColorField
        label="Accent"
        value={accent()}
        onChange={setAccent}
        contrastWith={[{ color: "#ffffff", label: "white text" }]}
      />
    ));
    await settle();
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Against white text this reads at 3.7:1");
    setAccent("#1d4ed8");
    await settle();
    expect(status.textContent).toBe("");
  });

  test("the picker checks too", async () => {
    render(() => (
      <ColorPicker
        label="Brand"
        defaultValue="#facc15"
        contrastWith={[{ color: "#ffffff", label: "white text", minimum: 3 }]}
      />
    ));
    await settle();
    expect(screen.getByRole("status").textContent).toContain("under the 3:1 text needs");
  });
});

describe("number pairs and limits on the server", () => {
  test("hydrate what the server wrote", async () => {
    const result = await hydrates(`
      import { ColorField, OptionalLimitField, PairedNumberField } from "<arc>";
      export function Page() {
        return (
          <div>
            <OptionalLimitField label="Alert" amountLabel="Minutes" sentence={(part) => "After " + part + " minutes"} defaultValue={10} />
            <OptionalLimitField label="Cap" mode="blank" amountLabel="Jobs" sentence={(part) => "At most " + part} />
            <PairedNumberField label="Viewport" labels={["Width", "Height"]} defaultValue={[1280, 720]} unit="pixels" />
            <ColorField label="Accent" defaultValue="#3b82f6" contrastWith={[{ color: "#ffffff", label: "white text" }]} />
          </div>
        );
      }
    `);
    expect(result.container.textContent).toContain("After");
    expect(result.container.querySelector('[data-slot="color-contrast"]')?.textContent).toContain(
      "white text",
    );
    result.unmount();
  });
});
