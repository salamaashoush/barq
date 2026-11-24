import { describe, expect, test } from "bun:test";
import { type Child, type Incoming, type JSXElement, flush } from "@barqjs/core";
import { type ZonedDateTime, parseDate, parseZonedDateTime } from "@barqjs/aria/date";
import { ariaViolations, render, screen, tick, user, waitFor } from "@barqjs/testing";

import { createArcForm, setServerErrors, useArcField, useArcForm } from "./form.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

/** What a test reads back of the form it rendered. */
interface Held {
  readonly state: { readonly values: Record<string, unknown>; readonly canSubmit: boolean };
}

interface Submits {
  AppForm: (props: Incoming<{ children?: Child }>) => JSXElement;
  handleSubmit: () => Promise<unknown>;
}

/** A `<form>` around the fields, submitting through the form API. */
function Shell(props: { form: Submits; children?: Child }) {
  const form = props.form;
  return (
    <form.AppForm>
      <form
        noValidate
        onSubmit={(event: Event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {props.children}
      </form>
    </form.AppForm>
  );
}

function describedBy(element: Element): string[] {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "")
    .map((id) => document.getElementById(id)?.textContent ?? "");
}

describe("TextField", () => {
  test("is named by its label, described by its line, and shows its error once touched", async () => {
    let form!: Held;
    render(() => {
      const live = useArcForm(() => ({ defaultValues: { email: "" } }));
      form = live;
      return (
        <Shell form={live}>
          <live.AppField
            name="email"
            validators={{ onBlur: ({ value }) => (value.includes("@") ? undefined : "Needs an @") }}
          >
            {(field) => (
              <field.TextField label="Email" type="email" description="Where receipts go." />
            )}
          </live.AppField>
        </Shell>
      );
    });
    await settle();
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input.getAttribute("type")).toBe("email");
    expect(describedBy(input)).toEqual(["Where receipts go."]);
    expect(input.hasAttribute("aria-invalid")).toBe(false);

    await user.type(input, "salama");
    input.blur();
    await settle();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy(input)).toEqual(["Where receipts go.", "Needs an @"]);
    expect(screen.getByRole("alert").textContent).toBe("Needs an @");
    expect(await ariaViolations(document.body)).toEqual([]);

    await user.type(input, "@example.com");
    input.blur();
    await settle();
    expect(form.state.values.email).toBe("salama@example.com");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("PasswordField", () => {
  test("hides what was typed until its button shows it", async () => {
    render(() => {
      const live = useArcForm(() => ({ defaultValues: { password: "" } }));
      return (
        <Shell form={live}>
          <live.AppField name="password">
            {(field) => <field.PasswordField label="Password" />}
          </live.AppField>
        </Shell>
      );
    });
    await settle();
    const input = document.querySelector("input[name=password]") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.labels?.[0]?.textContent).toBe("Password");
    const reveal = screen.getByRole("button", { name: "Show password" });
    expect(reveal.getAttribute("aria-pressed")).toBe("false");
    reveal.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("NumberField and TextareaField", () => {
  test("a number is held as a number, and as undefined when emptied", async () => {
    let form!: Held;
    render(() => {
      const live = useArcForm(() => ({
        defaultValues: { timeout: 30, notes: "" },
      }));
      form = live;
      return (
        <Shell form={live}>
          <live.AppField name="timeout">
            {(field) => <field.NumberField label="Timeout" unit="s" unitLabel="seconds" />}
          </live.AppField>
          <live.AppField name="notes">
            {(field) => <field.TextareaField label="Notes" rows={3} />}
          </live.AppField>
        </Shell>
      );
    });
    await settle();
    const timeout = screen.getByRole("spinbutton", { name: "Timeout (seconds)" });
    expect((timeout as HTMLInputElement).value).toBe("30");
    await user.clear(timeout);
    await settle();
    expect(form.state.values.timeout).toBeUndefined();
    await user.type(timeout, "45");
    await settle();
    expect(form.state.values.timeout).toBe(45);

    await user.type(screen.getByRole("textbox", { name: "Notes" }), "Two lines");
    await settle();
    expect(form.state.values.notes).toBe("Two lines");
  });
});

describe("SwitchField and CheckboxField", () => {
  test("sit beside their labels and flip from the keyboard", async () => {
    let form!: Held;
    render(() => {
      const live = useArcForm(() => ({ defaultValues: { alerts: false, terms: false } }));
      form = live;
      return (
        <Shell form={live}>
          <live.AppField name="alerts">
            {(field) => <field.SwitchField label="Alerts" description="Email me on failures." />}
          </live.AppField>
          <live.AppField name="terms">
            {(field) => <field.CheckboxField label="I agree" />}
          </live.AppField>
        </Shell>
      );
    });
    await settle();
    const alerts = screen.getByRole("switch", { name: "Alerts" });
    expect(describedBy(alerts)).toEqual(["Email me on failures."]);
    alerts.focus();
    await user.keyboard(" ");
    await settle();
    expect(form.state.values.alerts).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: "I agree" }));
    await settle();
    expect(form.state.values.terms).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});

const PLANS = [
  { value: "free", label: "Free" },
  { value: "team", label: "Team" },
  { value: "enterprise", label: "Enterprise" },
];

describe("SelectField and ComboboxField", () => {
  test("a select is named by its label and holds the chosen value", async () => {
    let form!: Held;
    render(() => {
      const live = useArcForm(() => ({ defaultValues: { plan: null as string | null } }));
      form = live;
      return (
        <Shell form={live}>
          <live.AppField name="plan">
            {(field) => (
              <field.SelectField label="Plan" options={PLANS} placeholder="Pick a plan" />
            )}
          </live.AppField>
        </Shell>
      );
    });
    await settle();
    const trigger = screen.getByRole("button", { name: /^Plan/ });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    await waitFor(() => screen.getByRole("listbox"));
    await user.click(screen.getByRole("option", { name: "Team" }));
    await settle();
    expect(form.state.values.plan).toBe("team");
    expect(trigger.textContent).toContain("Team");
  });

  test("a combobox finds an option by typing and holds its value", async () => {
    let form!: Held;
    render(() => {
      const live = useArcForm(() => ({ defaultValues: { plan: null as string | null } }));
      form = live;
      return (
        <Shell form={live}>
          <live.AppField name="plan">
            {(field) => <field.ComboboxField label="Plan" options={PLANS} />}
          </live.AppField>
        </Shell>
      );
    });
    await settle();
    const input = screen.getByRole("combobox", { name: "Plan" });
    await user.type(input, "ent");
    await settle();
    await waitFor(() => screen.getByRole("listbox"));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Enterprise",
    ]);
    await user.keyboard("{ArrowDown}{Enter}");
    await settle();
    expect(form.state.values.plan).toBe("enterprise");
  });

  test("a time zone is found by its city", async () => {
    let form!: Held;
    render(() => {
      const live = useArcForm(() => ({ defaultValues: { zone: "UTC" } }));
      form = live;
      return (
        <Shell form={live}>
          <live.AppField name="zone">
            {(field) => <field.TimeZoneField label="Time zone" />}
          </live.AppField>
        </Shell>
      );
    });
    await settle();
    const input = screen.getByRole("combobox", { name: "Time zone" });
    await user.clear(input);
    await user.type(input, "new york");
    await settle();
    await waitFor(() => screen.getByRole("option", { name: "America/New York" }));
    await user.click(screen.getByRole("option", { name: "America/New York" }));
    await settle();
    expect(form.state.values.zone).toBe("America/New_York");
  });
});

describe("DateField and DateTimeField", () => {
  test("a date is typed a segment at a time and held as a CalendarDate", async () => {
    let form!: Held;
    render(() => {
      const live = useArcForm(() => ({
        defaultValues: { due: parseDate("2026-03-08") },
      }));
      form = live;
      return (
        <Shell form={live}>
          <live.AppField name="due">
            {(field) => <field.DateField label="Due" description="The day it is owed." />}
          </live.AppField>
        </Shell>
      );
    });
    await settle();
    const group = screen.getByRole("group", { name: "Due" });
    expect(describedBy(group)).toEqual(["The day it is owed."]);
    const [first, ...rest] = screen.getAllByRole("spinbutton");
    expect(describedBy(first as HTMLElement)).toEqual(["The day it is owed."]);
    expect(rest.map((each) => each.hasAttribute("aria-describedby"))).toEqual(
      rest.map(() => false),
    );
    const day = screen.getByRole("spinbutton", { name: "day, Due" });
    day.focus();
    await user.keyboard("{ArrowUp}");
    await settle();
    expect(String(form.state.values.due)).toBe("2026-03-09");
  });

  test("a date and time is shown and written in the field's zone", async () => {
    let form!: Held;
    render(() => {
      const live = useArcForm(() => ({
        defaultValues: {
          starts: parseZonedDateTime("2026-03-08T12:00[UTC]"),
        },
      }));
      form = live;
      return (
        <Shell form={live}>
          <live.AppField name="starts">
            {(field) => <field.DateTimeField label="Starts" timeZone="Asia/Tokyo" />}
          </live.AppField>
        </Shell>
      );
    });
    await settle();
    const hour = screen.getByRole("spinbutton", { name: "hour, Starts" });
    expect(hour.getAttribute("aria-valuenow")).toBe("9");
    expect(screen.getByRole("group", { name: "Starts" }).textContent).toContain("GMT+9");
    hour.focus();
    await user.keyboard("{ArrowUp}");
    await settle();
    const held = form.state.values.starts as ZonedDateTime;
    expect(held.timeZone).toBe("Asia/Tokyo");
    expect(held.toAbsoluteString()).toBe("2026-03-08T13:00:00.000Z");
  });
});

describe("submitting", () => {
  test("the submit is pending while the form submits, and disabled while it is invalid", async () => {
    let finish: (() => void) | undefined;
    const saved: string[] = [];
    render(() => {
      const live = useArcForm(() => ({
        defaultValues: { name: "" },
        onSubmit: async ({ value }) => {
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
          saved.push(value.name);
        },
      }));
      return (
        <Shell form={live}>
          <live.AppField
            name="name"
            validators={{ onChange: ({ value }) => (value === "" ? "Required" : undefined) }}
          >
            {(field) => <field.TextField label="Name" />}
          </live.AppField>
          <live.SubmitButton>Create</live.SubmitButton>
        </Shell>
      );
    });
    await settle();
    const submit = screen.getByRole("button", { name: "Create" });
    const input = screen.getByRole("textbox", { name: "Name" });
    await user.type(input, "a");
    await user.clear(input);
    await settle();
    expect(submit.hasAttribute("disabled") || submit.getAttribute("aria-disabled") === "true").toBe(
      true,
    );

    await user.type(input, "Acme");
    await settle();
    expect(submit.hasAttribute("disabled")).toBe(false);
    await user.click(submit);
    await waitFor(() => expect(submit.hasAttribute("data-pending")).toBe(true));
    await waitFor(() => expect(typeof finish).toBe("function"));
    finish?.();
    await waitFor(() => expect(saved).toEqual(["Acme"]));
  });

  test("the server's errors land on their fields and the form, and editing retires them", async () => {
    let form!: Held;
    let unplaced: string[] = [];
    render(() => {
      const live = useArcForm(() => ({
        defaultValues: { email: "salama@example.com" },
        onSubmit: ({ formApi }) => {
          unplaced = setServerErrors(formApi, {
            fields: { email: "Already registered", plan: "No such plan" },
          });
        },
      }));
      form = live;
      return (
        <Shell form={live}>
          <live.FormError />
          <live.AppField name="email">{(field) => <field.TextField label="Email" />}</live.AppField>
          <live.SubmitButton>Register</live.SubmitButton>
        </Shell>
      );
    });
    await settle();
    await user.click(screen.getByRole("button", { name: "Register" }));
    await waitFor(() => expect(unplaced).toEqual(["No such plan"]));
    await settle();
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy(input)).toEqual(["Already registered"]);
    expect(
      document.querySelector('[data-slot="form-error"]')?.textContent?.includes("No such plan"),
    ).toBe(true);

    await user.type(input, "x");
    await settle();
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(document.querySelector('[data-slot="form-error"]')).toBeNull();
    expect(form.state.canSubmit).toBe(true);
  });
});

describe("createArcForm", () => {
  test("adds an app's own field beside arc's", async () => {
    function Shout(props: { label: string }) {
      const field = useArcField<string>();
      return <output aria-label={props.label}>{field().state.value.toUpperCase()}</output>;
    }
    const { useAppForm } = createArcForm({ fieldComponents: { Shout } });
    render(() => {
      const live = useAppForm(() => ({ defaultValues: { name: "acme" } }));
      return (
        <live.AppForm>
          <live.AppField name="name">
            {(field) => (
              <>
                <field.TextField label="Name" />
                <field.Shout label="Loud" />
              </>
            )}
          </live.AppField>
        </live.AppForm>
      );
    });
    await settle();
    expect(screen.getByLabelText("Loud").textContent).toBe("ACME");
  });

  test("refuses a field that would hide one of arc's", () => {
    expect(() => createArcForm({ fieldComponents: { TextField: () => null } })).toThrow(
      "arc already has a field named TextField",
    );
  });
});
