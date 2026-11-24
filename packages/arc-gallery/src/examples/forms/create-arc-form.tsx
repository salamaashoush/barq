import { Stack, Text, createArcForm, toast, useArcField } from "@barqjs/arc";

const slug = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** An app's own field: where the workspace will live, from the name typed. */
function AddressPreview(props: { domain: string }) {
  const field = useArcField<string>();
  return (
    <Text size="sm" color="muted">
      Your workspace will live at{" "}
      <Text as="span" mono size="sm">
        {slug(field().state.value) || "your-team"}.{props.domain}
      </Text>
    </Text>
  );
}

const { useAppForm } = createArcForm({ fieldComponents: { AddressPreview } });

export default function CreateArcFormExample() {
  const form = useAppForm(() => ({
    defaultValues: { workspace: "Acme Operations" },
    onSubmit: ({ value }) => {
      toast.success(`Created ${slug(value.workspace)}.example.com`);
    },
  }));

  return (
    <form.AppForm>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Stack gap={3}>
          <form.AppField
            name="workspace"
            validators={{
              onChange: ({ value }) =>
                slug(value) === "" ? "Use at least one letter or digit" : undefined,
            }}
          >
            {(field) => (
              <Stack gap={2}>
                <field.TextField label="Workspace name" />
                <field.AddressPreview domain="example.com" />
              </Stack>
            )}
          </form.AppField>
          <div>
            <form.SubmitButton>Create workspace</form.SubmitButton>
          </div>
        </Stack>
      </form>
    </form.AppForm>
  );
}
