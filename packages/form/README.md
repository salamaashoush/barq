# @barqjs/form

TanStack Form for barq. A thin adapter over `@tanstack/form-core`: the core owns the
form state, and barq signals carry the notifications that re-render what read it.

## Install

```sh
bun add @barqjs/form
```

`@barqjs/core` is a peer dependency. `@tanstack/form-core` and `@tanstack/store` come
with the package, and everything form-core exports is re-exported from here.

## Example

```tsx
import { createForm } from "@barqjs/form";

async function registerUser(user: { name: string; email: string }): Promise<void> {
  await fetch("https://example.com/api/users", { method: "POST", body: JSON.stringify(user) });
}

export function SignUp() {
  const form = createForm(() => ({
    defaultValues: { name: "salama", email: "" },
    onSubmit: async ({ value }) => {
      await registerUser(value);
    },
  }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) => (value.length < 2 ? "Too short" : undefined),
        }}
      >
        {(field) => (
          <label>
            Name
            <input
              value={field().state.value}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              onBlur={() => field().handleBlur()}
            />
            <em>{field().state.meta.errors.join(", ")}</em>
          </label>
        )}
      </form.Field>

      <form.Field
        name="email"
        validators={{
          onChangeAsyncDebounceMs: 300,
          onChangeAsync: async ({ value, signal }) => {
            const response = await fetch(`https://example.com/api/emails/${value}`, { signal });
            return response.ok ? "Already registered" : undefined;
          },
        }}
      >
        {(field) => (
          <label>
            Email
            <input
              type="email"
              value={field().state.value}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
            />
            <em>
              {field().state.meta.isValidating ? "Checking" : field().state.meta.errors.join(", ")}
            </em>
          </label>
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
      >
        {(state) => (
          <button type="submit" disabled={!state().canSubmit}>
            {state().isSubmitting ? "Saving" : "Sign up"}
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}
```

`field` and `state` are accessors: call them where the value is used, so the binding
that reads them is the one that updates.

### Array fields

Rows are addressed by index, so the list is keyed by position.

```tsx
<form.Field name="people" mode="array">
  {(people) => (
    <ul>
      <For each={people().state.value} keyed={false}>
        {(_person: () => Person, index: number) => (
          <form.Field name={`people[${index}].name`}>
            {(field) => (
              <li>
                <NameInput
                  value={field().state.value}
                  onChange={(value) => field().handleChange(value)}
                />
              </li>
            )}
          </form.Field>
        )}
      </For>
      <button type="button" onClick={() => people().pushValue({ name: "" })}>
        Add
      </button>
    </ul>
  )}
</form.Field>
```

`mode="array"` makes the list field follow the array's shape only, so editing one row
does not re-render the list.

### Errors from the server

`transform` is re-applied whenever it changes, so server state held in a signal is
merged into the live form.

```tsx
const [serverState, setServerState] = createSignal<Partial<AnyFormState>>({
  errorMap: { onServer: undefined },
});

const form = createForm(() => {
  const fromServer = serverState();
  return {
    defaultValues: { email: "" },
    transform: (base: unknown) => mergeForm(base as AnyFormApi, fromServer),
    onSubmit: async ({ value }) => {
      setServerState(await registerOnServer(value));
    },
  };
});
```

A server answer of `{ errorMap: { onServer: { form: "Could not register", fields: {
email: "Already registered" } } } }` lands in `form.state.errors` and in the `email`
field's `meta.errors`.

### Shared field and form components

```tsx
const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

function TextField(props: Incoming<{ label: string }>) {
  const field = useFieldContext<string>();
  return (
    <label>
      {props.label()}
      <input
        value={field().state.value}
        onInput={(event) => field().handleChange(event.currentTarget.value)}
      />
    </label>
  );
}

function SubmitButton(props: Incoming<{ label: string }>) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <button type="submit" disabled={isSubmitting()}>
          {props.label()}
        </button>
      )}
    </form.Subscribe>
  );
}

const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldComponents: { TextField },
  formComponents: { SubmitButton },
  fieldContext,
  formContext,
});

function Profile() {
  const form = useAppForm(() => ({ defaultValues: { name: "salama" } }));
  return (
    <form.AppForm>
      <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
      <form.SubmitButton label="Save" />
    </form.AppForm>
  );
}
```

## API

- `createForm(() => options)`: a `FormApi` with `Field`, `FormGroup`, `Subscribe`,
  `useSelector` and `useStore` bound to it.
- `createField(() => options)`: a field as an accessor. `Field` is the component form,
  and `form.Field` is `Field` with `form` filled in.
- `createFormGroup(() => options)`, `FormGroup`, `form.FormGroup`: a nested object of
  the form with its own validators and submit.
- `createFieldGroup(() => options)`: a reusable set of fields bound to one path of a
  form, or to a map of paths.
- `createFormHookContexts()`: `fieldContext`, `formContext`, `useFieldContext`,
  `useFormContext`.
- `createFormHook({ fieldComponents, formComponents, fieldContext, formContext })`:
  `useAppForm`, `withForm`, `withFieldGroup`, `useTypedAppFormContext`, `extendForm`.
- `useSelector(store, selector?, { compare }?)` and its alias
  `useStore(store, selector?, compare?)`: a slice of any TanStack store or atom as an
  accessor. `shallow` is the default comparison and is exported.
- Everything from `@tanstack/form-core`: `formOptions`, `mergeForm`, `FormApi`,
  `FieldApi`, `revalidateLogic`, the Standard Schema helpers, and the types.

## Differences from `@tanstack/solid-form`

- Props are Cells and children are Blocks, as everywhere in barq. A component passed to
  `createFormHook`, and the `render` of `withForm` and `withFieldGroup`, read
  `props.label()` and `props.form()`.
- `useSelector` compares selections with `shallow` rather than `===`, so a selector
  that builds an object does not notify on every change of the store. Pass `compare`
  to change it.
- An accessor returned by `useSelector`, and `field()`, answer with the core's current
  state. A barq signal write is staged until the next flush, so the signals here only
  carry the notification: a handler that writes to the form and reads it back in the
  same tick sees what it wrote.
- Field and form group options are reactive: a validator or default value that reads a
  signal is re-applied when the signal changes.
- A field mounts in a render effect rather than after the tree settles, so a
  field-level `defaultValue` is in the form before the field's children are built.
- `transform` is re-applied when it changes, as in the React adapter.
- `createFormHook` also returns `useTypedAppFormContext` and `extendForm`, from the
  React adapter.
- `props` given to `withForm` and `withFieldGroup` are defaults, and the component they
  return takes them as optional.
- A field group's `Subscribe` hands its children an accessor, like `form.Subscribe`.
- The extended types are named for barq: `BarqFormApi`, `BarqFormExtendedApi`,
  `AppFieldExtendedBarqFormApi`, `AppFieldExtendedBarqFieldGroupApi`.
- Array rows use `<For keyed={false}>` where Solid uses `<Index>`.

## Not included

The server helpers of the framework integrations (`createServerValidate`,
`getFormData`, `initialFormState`) are not part of the Solid adapter and are not here.
The `transform` and `mergeForm` pattern above is what they build on.
