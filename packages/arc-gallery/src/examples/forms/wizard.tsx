import { createSignal } from "@barqjs/core";
import { InlineAlert, Stack, Wizard, useArcForm, type FieldOption } from "@barqjs/arc";

const PLANS = [
  { value: "starter", label: "Starter, free" },
  { value: "team", label: "Team, $12 a seat" },
  { value: "business", label: "Business, $29 a seat" },
];

function label(options: readonly FieldOption[]) {
  return (value: unknown) =>
    options.find((option) => option.value === value)?.label ?? "Not chosen";
}

export default function WizardExample() {
  const [done, setDone] = createSignal(false);

  const form = useArcForm(() => ({
    defaultValues: {
      workspace: "",
      zone: "Africa/Cairo",
      invites: "",
      plan: "team",
    },
    onSubmit: async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      setDone(true);
    },
  }));

  return (
    <Stack gap={4}>
      <Wizard
        aria-label="Set up your workspace"
        form={form}
        submitLabel="Create workspace"
        steps={[
          {
            id: "workspace",
            label: "Workspace",
            description: "Name it and say where your team works.",
            fields: [
              { name: "workspace", label: "Name" },
              { name: "zone", label: "Time zone" },
            ],
          },
          {
            id: "team",
            label: "Team",
            description: "Invite people now or later.",
            optional: true,
            fields: [
              {
                name: "invites",
                label: "Invitations",
                format: (value) => String(value) || "None yet",
              },
            ],
          },
          {
            id: "plan",
            label: "Plan",
            fields: [{ name: "plan", label: "Plan", format: label(PLANS) }],
          },
          { id: "review", label: "Review", summary: true },
        ]}
      >
        {(step) => (
          <Stack gap={3}>
            {step.id === "workspace" ? (
              <>
                <form.AppField
                  name="workspace"
                  validators={{
                    onSubmit: ({ value }) =>
                      value.trim() === "" ? "Name the workspace" : undefined,
                  }}
                >
                  {(field) => (
                    <field.TextField label="Workspace name" placeholder="Acme Operations" />
                  )}
                </form.AppField>
                <form.AppField name="zone">
                  {(field) => <field.TimeZoneField label="Time zone" />}
                </form.AppField>
              </>
            ) : step.id === "team" ? (
              <form.AppField name="invites">
                {(field) => (
                  <field.TextareaField
                    label="Email addresses"
                    description="One per line: lina@example.com"
                    rows={4}
                  />
                )}
              </form.AppField>
            ) : (
              <form.AppField name="plan">
                {(field) => <field.SelectField label="Plan" options={PLANS} />}
              </form.AppField>
            )}
          </Stack>
        )}
      </Wizard>
      {done() ? (
        <InlineAlert tone="success" title="Workspace created">
          Your team can sign in now.
        </InlineAlert>
      ) : null}
    </Stack>
  );
}
