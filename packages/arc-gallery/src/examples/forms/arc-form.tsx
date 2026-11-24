import { Show, createSignal } from "@barqjs/core";
import type { CalendarDate, ZonedDateTime } from "@barqjs/aria/date";
import { Grid, InlineAlert, Stack, Text, setServerErrors, useArcForm } from "@barqjs/arc";

const REGIONS = [
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "us-east-1", label: "US East (Virginia)" },
  { value: "me-central-1", label: "Middle East (UAE)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)", isDisabled: true },
];

const OWNERS = ["Salama", "Lina", "Omar", "Maya", "Jonas"].map((name) => ({
  value: name.toLowerCase(),
  label: name,
}));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const required =
  (label: string) =>
  ({ value }: { value: unknown }) =>
    value === "" || value === null || value === undefined ? `${label} is required` : undefined;

export default function ArcFormExample() {
  const [created, setCreated] = createSignal<string | null>(null);

  const form = useArcForm(() => ({
    defaultValues: {
      name: "",
      plan: "Business",
      email: "salama@example.com",
      password: "",
      seats: 5,
      description: "",
      region: null as string | null,
      owner: null as string | null,
      zone: "Europe/Berlin",
      launch: null as CalendarDate | null,
      maintenance: null as ZonedDateTime | null,
      public: false,
      terms: false,
    },
    onSubmit: async ({ value, formApi }) => {
      setCreated(null);
      await wait(900);
      if (value.name.trim().toLowerCase() === "acme") {
        setServerErrors(formApi, {
          form: "The project could not be created.",
          fields: { name: "A project called Acme already exists in this workspace" },
        });
        return;
      }
      if (value.region === "me-central-1") {
        setServerErrors(formApi, {
          form: "Middle East (UAE) has no capacity left this month. Pick another region.",
        });
        return;
      }
      setCreated(value.name);
      formApi.reset();
    },
  }));

  return (
    <form.AppForm>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Stack gap={4}>
          <Text size="sm" color="muted">
            Name it "Acme" or pick the UAE region to see the server refuse it.
          </Text>
          <form.FormError />
          <Show when={created()}>
            {(name) => (
              <InlineAlert tone="success" title="Project created">
                {name()} is ready. Invite your team from its settings.
              </InlineAlert>
            )}
          </Show>
          <Grid columns={{ base: 1, cqMd: 2 }} gap={4}>
            <form.AppField name="name" validators={{ onChange: required("A name") }}>
              {(field) => (
                <field.TextField label="Project name" placeholder="Billing revamp" isRequired />
              )}
            </form.AppField>
            <form.AppField
              name="email"
              validators={{
                onBlur: ({ value }) =>
                  /^\S+@\S+\.\S+$/.test(value)
                    ? undefined
                    : "Enter an email like salama@example.com",
              }}
            >
              {(field) => (
                <field.TextField
                  label="Billing email"
                  type="email"
                  autoComplete="email"
                  description="Invoices go here."
                />
              )}
            </form.AppField>
            <form.AppField
              name="password"
              validators={{
                onChange: ({ value }) =>
                  value.length > 0 && value.length < 12 ? "Use at least 12 characters" : undefined,
              }}
            >
              {(field) => (
                <field.PasswordField label="Deploy key passphrase" autoComplete="new-password" />
              )}
            </form.AppField>
            <form.AppField
              name="seats"
              validators={{
                onChange: ({ value }) =>
                  value === undefined || value < 1 ? "At least one seat" : undefined,
              }}
            >
              {(field) => (
                <field.NumberField label="Seats" min={1} max={500} step={1} unit="seats" />
              )}
            </form.AppField>
            <form.AppField name="region" validators={{ onChange: required("A region") }}>
              {(field) => (
                <field.SelectField label="Region" options={REGIONS} placeholder="Choose a region" />
              )}
            </form.AppField>
            <form.AppField name="owner">
              {(field) => (
                <field.ComboboxField
                  label="Owner"
                  options={OWNERS}
                  placeholder="Search people"
                  emptyLabel="Nobody by that name"
                />
              )}
            </form.AppField>
            <form.AppField name="zone">
              {(field) => (
                <field.TimeZoneField
                  label="Time zone"
                  description="Reports are sent at 09:00 here."
                />
              )}
            </form.AppField>
            <form.AppField name="launch">
              {(field) => <field.DateField label="Launch date" />}
            </form.AppField>
            <form.AppField name="maintenance">
              {(field) => (
                <field.DateTimeField label="First maintenance window" timeZone="Europe/Berlin" />
              )}
            </form.AppField>
            <form.AppField name="plan">
              {(field) => (
                <field.TextField label="Plan" description="Set by your workspace." isDisabled />
              )}
            </form.AppField>
          </Grid>
          <form.AppField name="description">
            {(field) => <field.TextareaField label="What is it for?" rows={3} maxLength={280} />}
          </form.AppField>
          <form.AppField name="public">
            {(field) => (
              <field.SwitchField
                label="Public status page"
                description="Anyone with the link sees uptime."
              />
            )}
          </form.AppField>
          <form.AppField
            name="terms"
            validators={{
              onChange: ({ value }) => (value ? undefined : "Agree to the terms to continue"),
            }}
          >
            {(field) => (
              <field.CheckboxField label="I agree to the Acme terms of service" isRequired />
            )}
          </form.AppField>
          <div>
            <form.SubmitButton>Create project</form.SubmitButton>
          </div>
        </Stack>
      </form>
    </form.AppForm>
  );
}
