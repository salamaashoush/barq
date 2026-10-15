import { afterEach, describe, expect, mock, test } from "bun:test";
import { type Incoming, createRoot, flush } from "@barqjs/core";

import {
  createFieldGroup,
  createForm,
  createFormGroup,
  createFormHook,
  createFormHookContexts,
  formOptions,
} from "./index.ts";
import { click, mount, settle, type } from "./test-helpers.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

function TextField(props: Incoming<{ label: string }>) {
  const field = useFieldContext<string>();
  return (
    <label>
      <span>{props.label()}</span>
      <input
        data-field={field().name}
        value={field().state.value}
        onInput={(event) => field().handleChange(event.currentTarget.value)}
      />
    </label>
  );
}

function NumberField(props: Incoming<{ label: string }>) {
  const field = useFieldContext<number>();
  return (
    <label>
      <span>{props.label()}</span>
      <input
        data-field={field().name}
        value={`${field().state.value}`}
        onInput={(event) => field().handleChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function SubmitButton(props: Incoming<{ label: string }>) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <button
          type="button"
          id="submit"
          disabled={isSubmitting()}
          onClick={() => {
            void form.handleSubmit();
          }}
        >
          {props.label()}
        </button>
      )}
    </form.Subscribe>
  );
}

const { useAppForm, withForm, withFieldGroup, extendForm, useTypedAppFormContext } = createFormHook(
  {
    fieldComponents: { TextField },
    formComponents: { SubmitButton },
    fieldContext,
    formContext,
  },
);

const fieldInput = (host: HTMLElement, name: string): HTMLInputElement => {
  const found = host.querySelector<HTMLInputElement>(`[data-field="${name}"]`);
  if (found === null) throw new Error(`no input for ${name}`);
  return found;
};

describe("createFormHook", () => {
  test("AppField hands the field its registered components, AppForm provides the form", async () => {
    const saved = mock((_value: { name: string }) => {});
    const view = mount(() => {
      const form = useAppForm(() => ({
        defaultValues: { name: "salama" },
        onSubmit: ({ value }) => saved(value),
      }));
      return (
        <div>
          <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
          <form.AppForm>
            <form.SubmitButton label="Save" />
          </form.AppForm>
        </div>
      );
    });

    expect(view.text("label span")).toBe("Name");
    expect(fieldInput(view.host, "name").value).toBe("salama");

    type(fieldInput(view.host, "name"), "salama a");
    click(view.host.querySelector("#submit") as Element);
    await settle();
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0]?.[0]).toEqual({ name: "salama a" });
    view.dispose();
  });

  test("the contexts refuse to be read outside their providers", () => {
    createRoot((dispose) => {
      expect(() => useFieldContext()).toThrow(
        "`fieldContext` only works when within a `fieldComponent` passed to `createFormHook`",
      );
      expect(() => useFormContext()).toThrow(
        "`formContext` only works when within a `formComponent` passed to `createFormHook`",
      );
      dispose();
    });
  });

  test("withForm renders a section of a form built elsewhere, with default props", () => {
    const options = formOptions({ defaultValues: { name: "salama", email: "" } });

    const ContactSection = withForm({
      ...options,
      props: { title: "Contact" },
      render: (props) => {
        const form = props.form();
        return (
          <section>
            <h2>{props.title()}</h2>
            <form.AppField name="email">
              {(field) => <field.TextField label="Email" />}
            </form.AppField>
          </section>
        );
      },
    });

    let form!: ReturnType<typeof build>;
    const build = () => useAppForm(() => ({ ...options }));
    const view = mount(() => {
      form = build();
      return (
        <div>
          <ContactSection form={form} />
          <ContactSection form={form} title="Reach me" />
        </div>
      );
    });

    const titles = [...view.host.querySelectorAll("h2")].map((heading) => heading.textContent);
    expect(titles).toEqual(["Contact", "Reach me"]);

    type(fieldInput(view.host, "email"), "salama@example.com");
    expect(form.state.values.email).toBe("salama@example.com");
    const inputs = [...view.host.querySelectorAll<HTMLInputElement>('[data-field="email"]')];
    expect(inputs.map((input) => input.value)).toEqual([
      "salama@example.com",
      "salama@example.com",
    ]);
    view.dispose();
  });

  test("withFieldGroup binds a reusable set of fields to one path of a form", () => {
    const PasswordFields = withFieldGroup({
      defaultValues: { password: "", confirm: "" },
      props: { title: "Password" },
      render: (props) => {
        const group = props.group();
        return (
          <fieldset>
            <legend>{props.title()}</legend>
            <group.AppField name="password">
              {(field) => <field.TextField label="Password" />}
            </group.AppField>
            <group.AppField
              name="confirm"
              validators={{
                onChangeListenTo: ["password"],
                onChange: ({ value, fieldApi }) =>
                  value === group.getFieldValue("password") || !fieldApi.state.meta.isTouched
                    ? undefined
                    : "does not match",
              }}
            >
              {(field) => (
                <div>
                  <field.TextField label="Confirm" />
                  <em id="confirm-errors">{field().state.meta.errors.join("|")}</em>
                </div>
              )}
            </group.AppField>
            <group.Subscribe selector={(state) => state.values.password.length}>
              {(length) => <em id="length">{length()}</em>}
            </group.Subscribe>
          </fieldset>
        );
      },
    });

    let form!: ReturnType<typeof build>;
    const build = () =>
      useAppForm(() => ({
        defaultValues: { name: "salama", account: { password: "", confirm: "" } },
      }));
    const view = mount(() => {
      form = build();
      return <PasswordFields form={form} fields="account" />;
    });

    expect(view.text("legend")).toBe("Password");
    type(fieldInput(view.host, "account.password"), "secret");
    expect(form.state.values.account.password).toBe("secret");
    expect(view.text("#length")).toBe("6");

    type(fieldInput(view.host, "account.confirm"), "secre");
    expect(view.text("#confirm-errors")).toBe("does not match");
    type(fieldInput(view.host, "account.password"), "secre");
    expect(view.text("#confirm-errors")).toBe("");
    view.dispose();
  });

  test("a field group maps its own keys onto scattered form paths", () => {
    let form!: ReturnType<typeof build>;
    const build = () =>
      useAppForm(() => ({ defaultValues: { login: "salama", secret: "", other: 1 } }));
    const view = mount(() => {
      form = build();
      const group = createFieldGroup(() => ({
        form,
        fields: { username: "login", password: "secret" } as const,
        defaultValues: { username: "", password: "" },
        formComponents: { SubmitButton },
      }));
      return (
        <div>
          <group.Field name="username">
            {(field) => <span id="username">{field().state.value}</span>}
          </group.Field>
          <group.Field name="password">
            {(field) => (
              <input
                id="password"
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
              />
            )}
          </group.Field>
        </div>
      );
    });

    expect(view.text("#username")).toBe("salama");
    type(view.input("#password"), "hunter2");
    expect(form.state.values.secret).toBe("hunter2");
    view.dispose();
  });

  test("extendForm adds components and keeps the contexts", () => {
    const extended = extendForm({ fieldComponents: { NumberField } });
    const view = mount(() => {
      const form = extended.useAppForm(() => ({ defaultValues: { name: "salama", age: 30 } }));
      return (
        <div>
          <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
          <form.AppField name="age">{(field) => <field.NumberField label="Age" />}</form.AppField>
          <form.Subscribe selector={(state) => state.values.age}>
            {(age) => <em id="age">{age() + 1}</em>}
          </form.Subscribe>
        </div>
      );
    });

    expect(fieldInput(view.host, "name").value).toBe("salama");
    type(fieldInput(view.host, "age"), "41");
    expect(view.text("#age")).toBe("42");
    view.dispose();
  });

  test("useTypedAppFormContext reads the provided form with its data type", () => {
    const options = formOptions({ defaultValues: { name: "salama" } });

    function Summary() {
      const form = useTypedAppFormContext(options);
      const name = form.useSelector((state) => state.values.name);
      return <p id="summary">{name().toUpperCase()}</p>;
    }

    const view = mount(() => {
      const form = useAppForm(() => ({ ...options }));
      return (
        <form.AppForm>
          <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
          <Summary />
        </form.AppForm>
      );
    });

    expect(view.text("#summary")).toBe("SALAMA");
    type(fieldInput(view.host, "name"), "sal");
    expect(view.text("#summary")).toBe("SAL");
    view.dispose();
  });
});

describe("form groups", () => {
  test("a group submits on its own, without the form's handler", async () => {
    const onSubmit = mock(() => {});
    const onGroupSubmit = mock(() => {});
    const onGroupSubmitInvalid = mock(() => {});

    const view = mount(() => {
      const form = createForm(() => ({
        defaultValues: { step1: { name: "" }, step2: { name: "later" } },
        onSubmit,
      }));
      return (
        <form.FormGroup
          name="step1"
          validators={{
            onSubmit: ({ value }) => (value.name === "" ? "name is required" : undefined),
          }}
          onGroupSubmit={onGroupSubmit}
          onGroupSubmitInvalid={onGroupSubmitInvalid}
        >
          {(group) => (
            <div>
              <form.Field name="step1.name">
                {(field) => (
                  <input
                    id="name"
                    value={field().state.value}
                    onInput={(event) => field().handleChange(event.currentTarget.value)}
                  />
                )}
              </form.Field>
              <pre id="value">{JSON.stringify(group().state.value)}</pre>
              <em id="errors">{group().state.meta.errors.join("|")}</em>
              <button
                type="button"
                id="next"
                onClick={() => {
                  void group().handleSubmit();
                }}
              >
                next
              </button>
            </div>
          )}
        </form.FormGroup>
      );
    });

    expect(view.text("#value")).toBe('{"name":""}');

    click(view.host.querySelector("#next") as Element);
    await settle();
    expect(onGroupSubmitInvalid).toHaveBeenCalledTimes(1);
    expect(onGroupSubmit).not.toHaveBeenCalled();
    expect(view.text("#errors")).toBe("name is required");

    type(view.input("#name"), "salama");
    expect(view.text("#value")).toBe('{"name":"salama"}');

    click(view.host.querySelector("#next") as Element);
    await settle();
    expect(onGroupSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(view.text("#errors")).toBe("");
    view.dispose();
  });

  test("createFormGroup returns the group as an accessor that follows the form", () => {
    createRoot((dispose) => {
      const form = createForm(() => ({ defaultValues: { address: { city: "Cairo" } } }));
      const group = createFormGroup(() => ({ form, name: "address" }));
      flush();
      expect(group().state.value).toEqual({ city: "Cairo" });
      form.setFieldValue("address.city", "Giza");
      expect(group().state.value).toEqual({ city: "Giza" });
      dispose();
    });
  });
});
