import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { accessibleName, ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { CollectionField } from "./collection-field.tsx";
import type { DataTableColumn } from "./data-table.tsx";
import { FieldRule, type PrunedValues, fieldRules } from "./field-rules.tsx";
import { setServerErrors, useArcForm } from "./form.tsx";
import { OptionGroup } from "./option-group.tsx";
import { RepeaterField } from "./repeater-field.tsx";

afterEach(() => destroyAnnouncer());

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("OptionGroup", () => {
  test("folded under its title and a summary; its fields stay mounted", async () => {
    render(() => (
      <OptionGroup title="Network" summary="Full speed, straight to the site">
        <label>
          Proxy <input name="proxy" />
        </label>
      </OptionGroup>
    ));
    await settle();
    const trigger = screen.getByRole("button", { name: /Network/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("Full speed, straight to the site");
    expect(document.querySelector('input[name="proxy"]')).not.toBeNull();
    await user.click(trigger);
    await settle();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(await ariaViolations(document.body)).toEqual([]);
    trigger.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("opens itself and says so when a field inside takes an error", async () => {
    let refuse: () => void = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { proxy: "" } }));
      refuse = () => setServerErrors(form, { fields: { proxy: "That proxy refused us." } });
      return (
        <form.AppForm>
          <OptionGroup title="Network" summary="Direct" fields={["proxy"]}>
            <form.AppField name="proxy">
              {(field) => <field.TextField label="Proxy" />}
            </form.AppField>
          </OptionGroup>
        </form.AppForm>
      );
    });
    await settle();
    const trigger = screen.getByRole("button", { name: /Network/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    refuse();
    await settle();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(accessibleName(trigger)).toContain("Holds an error");
    expect(screen.getByText("That proxy refused us.")).toBeDefined();
  });
});

interface CheckValues {
  locations: string[];
  quorum: number;
  retries: number;
  retryDelay: number;
}

const RULES = fieldRules<CheckValues>({
  quorum: {
    show: (values) => values.locations.length > 1,
    max: (values) => values.locations.length,
  },
  retryDelay: {
    disable: (values) => (values.retries === 0 ? "Set a retry first." : undefined),
    describe: (values) => `${String(values.retryDelay)} s between tries`,
  },
});

interface RetryValues {
  retry: RetryGroup;
}

interface RetryGroup {
  on: boolean;
  delay: number;
}

describe("field rules", () => {
  test("show, disable with a reason and bound a field by the others; prune drops what is hidden", async () => {
    let saved: PrunedValues<CheckValues> | undefined;
    let setLocations: (next: string[]) => void = () => undefined;
    let setRetries: (next: number) => void = () => undefined;
    let submit: () => Promise<void> = () => Promise.resolve();
    render(() => {
      const defaults: CheckValues = { locations: ["eu"], quorum: 1, retries: 0, retryDelay: 5 };
      const form = useArcForm(() => ({
        defaultValues: defaults,
        onSubmit: ({ value }) => {
          saved = RULES.prune(value);
        },
      }));
      setLocations = (next) => form.setFieldValue("locations", next);
      setRetries = (next) => form.setFieldValue("retries", next);
      submit = () => form.handleSubmit();
      return (
        <form.AppForm>
          <FieldRule rules={RULES} name="quorum">
            {(rule) => (
              <p data-testid="quorum" data-max={String(rule().max)}>
                Quorum
              </p>
            )}
          </FieldRule>
          <FieldRule rules={RULES} name="retryDelay">
            {(rule) => (
              <p data-testid="delay" data-disabled={rule().isDisabled ? "" : undefined}>
                {rule().description}
              </p>
            )}
          </FieldRule>
        </form.AppForm>
      );
    });
    await settle();
    expect(screen.queryByTestId("quorum")).toBeNull();
    expect(screen.getByTestId("delay").textContent).toBe("Set a retry first.");
    expect(screen.getByTestId("delay").hasAttribute("data-disabled")).toBe(true);
    await submit();
    expect(saved).toEqual({ locations: ["eu"], retries: 0, retryDelay: 5 });
    setLocations(["eu", "us", "ap"]);
    setRetries(2);
    await settle();
    expect(screen.getByTestId("quorum").getAttribute("data-max")).toBe("3");
    expect(screen.getByTestId("delay").textContent).toBe("5 s between tries");
    expect(screen.getByTestId("delay").hasAttribute("data-disabled")).toBe(false);
    await submit();
    expect(saved?.quorum).toBe(1);
  });

  test("prune reaches into a group by a dotted name", () => {
    const rules = fieldRules<RetryValues>({
      "retry.delay": { show: (values) => values.retry.on },
    });
    expect(rules.prune({ retry: { on: false, delay: 3 } })).toEqual({ retry: { on: false } });
    expect(rules.prune({ retry: { on: true, delay: 3 } })).toEqual({
      retry: { on: true, delay: 3 },
    });
  });
});

interface Header {
  key: string;
  value: string;
}

describe("RepeaterField", () => {
  test("adds, names, moves and removes rows of a form array, focus following", async () => {
    let read: () => Header[] = () => [];
    render(() => {
      const form = useArcForm(() => ({
        defaultValues: { headers: [{ key: "Accept", value: "*/*" }] as Header[] },
      }));
      read = () => form.state.values.headers;
      return (
        <form.AppForm>
          <form.AppField name="headers" mode="array">
            {(field) => (
              <field.RepeaterField
                label="Headers"
                reorderable
                max={3}
                newRow={() => ({ key: "", value: "" })}
                rowLabel={(row: Header, index: number) => row.key || `Header ${String(index + 1)}`}
              >
                {(row) => (
                  <form.AppField name={row.name("key") as `headers[${number}].key`}>
                    {(cell) => <cell.TextField label="Name" />}
                  </form.AppField>
                )}
              </field.RepeaterField>
            )}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    expect(screen.getByRole("list", { name: "Headers" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Add row" }));
    await settle();
    expect(read()).toHaveLength(2);
    const inputs = screen.getAllByRole<HTMLInputElement>("textbox", { name: "Name" });
    expect(document.activeElement).toBe(inputs[1] ?? null);
    await user.type(inputs[1] as HTMLInputElement, "Authorization");
    await settle();
    await user.click(screen.getByRole("button", { name: "Move Authorization up" }));
    await settle();
    expect(read().map((row) => row.key)).toEqual(["Authorization", "Accept"]);
    await user.click(screen.getByRole("button", { name: "Remove Accept" }));
    await settle();
    expect(read().map((row) => row.key)).toEqual(["Authorization"]);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Move Authorization up" }).disabled,
    ).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("stands alone, keeps its minimum and stops at its maximum", async () => {
    const [rows, setRows] = createSignal<readonly string[]>(["a"]);
    render(() => (
      <Rtl>
        <RepeaterField<string>
          label="Options"
          min={1}
          max={2}
          newRow={() => ""}
          value={rows()}
          onChange={setRows}
        >
          {(row) => (
            <input
              aria-label={`Option ${String(row.index + 1)}`}
              value={row.value()}
              onInput={(event: Event) =>
                row.update((event.currentTarget as HTMLInputElement).value)
              }
            />
          )}
        </RepeaterField>
      </Rtl>
    ));
    await settle();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Remove Row 1" }).disabled).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "Add row" }));
    await settle();
    expect(rows()).toEqual(["a", ""]);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Add row" }).disabled).toBe(true);
    await user.type(screen.getByRole("textbox", { name: "Option 2" }), "b");
    await settle();
    expect(rows()).toEqual(["a", "b"]);
  });
});

interface Fee {
  name: string;
  amount: number;
}

const FEE_COLUMNS: DataTableColumn<Fee>[] = [
  { id: "name", header: "Fee", accessorKey: "name" },
  { id: "amount", header: "Amount", accessorKey: "amount", align: "end" },
];

describe("CollectionField", () => {
  test("a table of records, each added and edited in a sheet of its own", async () => {
    let read: () => Fee[] = () => [];
    render(() => {
      const form = useArcForm(() => ({
        defaultValues: { fees: [{ name: "Tuition", amount: 1200 }] as Fee[] },
      }));
      read = () => form.state.values.fees;
      return (
        <form.AppForm>
          <form.AppField name="fees">
            {() => (
              <CollectionField<Fee>
                label="Fees"
                columns={FEE_COLUMNS}
                newRecord={() => ({ name: "", amount: 0 })}
                recordLabel={(fee: Fee) => fee.name}
                editor={(sheet) => (
                  <sheet.AppField name="name">
                    {(cell) => <cell.TextField label="Name" />}
                  </sheet.AppField>
                )}
              />
            )}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    expect(screen.getByText("Tuition")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Add row" }));
    await settle();
    await settle();
    const name = screen.getByRole<HTMLInputElement>("textbox", { name: "Name" });
    expect(name.value).toBe("");
    await user.type(name, "Books");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    await settle();
    expect(read()).toEqual([
      { name: "Tuition", amount: 1200 },
      { name: "Books", amount: 0 },
    ]);
    await user.click(screen.getByRole("button", { name: "Edit Tuition" }));
    await settle();
    await settle();
    const editing = screen.getByRole<HTMLInputElement>("textbox", { name: "Name" });
    expect(editing.value).toBe("Tuition");
    await user.clear(editing);
    await user.type(editing, "Tuition fee");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    await settle();
    expect(read()[0]?.name).toBe("Tuition fee");
  });
});

describe("form structure on the server", () => {
  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { OptionGroup, RepeaterField } from "<arc>";
      export function Page() {
        return (
          <div>
            <OptionGroup title="Network" summary="Direct"><input aria-label="Proxy" /></OptionGroup>
            <RepeaterField label="Options" defaultValue={["a", "b"]} newRow={() => ""} reorderable>
              {(row) => <input aria-label={"Option " + String(row.index + 1)} value={row.value()} />}
            </RepeaterField>
          </div>
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="repeater-row"]')).toHaveLength(2);
    result.unmount();
  });
});
