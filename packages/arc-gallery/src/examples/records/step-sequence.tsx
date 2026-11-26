import { Inline, Stack, StepSequenceEditor, Text, srOnly, useArcForm } from "@barqjs/arc";

interface Request {
  name: string;
  method: string;
  url: string;
}

const METHODS = ["GET", "POST", "PUT", "DELETE"].map((method) => ({
  value: method,
  label: method,
}));

const STEPS: Request[] = [
  { name: "Sign in", method: "POST", url: "https://api.example.com/session" },
  { name: "Load the cart", method: "GET", url: "https://api.example.com/cart" },
  { name: "Check out", method: "POST", url: "https://api.example.com/checkout" },
];

export default function StepSequenceExample() {
  const form = useArcForm(() => ({ defaultValues: { steps: STEPS } }));
  return (
    <Stack gap={8}>
      <form.AppForm>
        <form.AppField name="steps" mode="array">
          {(field) => (
            <field.StepSequenceEditor
              label="Requests"
              description="Run in order; a step that fails stops the check."
              max={6}
              newStep={(index) => ({
                name: "",
                method: "GET",
                url: index === 0 ? "https://" : "",
              })}
              stepLabel={(step: Request, index: number) => step.name || `Step ${String(index + 1)}`}
              summary={(step: Request) => `${step.method} ${step.url}`}
              title={(row) => (
                <form.AppField name={`steps[${row.index}].name`}>
                  {(name) => (
                    <name.TextField
                      label="Step name"
                      classes={{ label: srOnly }}
                      placeholder="Name this step"
                    />
                  )}
                </form.AppField>
              )}
            >
              {(row) => (
                <Inline gap={3} align="end">
                  <form.AppField name={`steps[${row.index}].method`}>
                    {(method) => <method.SelectField label="Method" options={METHODS} />}
                  </form.AppField>
                  <form.AppField name={`steps[${row.index}].url`}>
                    {(url) => <url.TextField label="URL" type="url" />}
                  </form.AppField>
                </Inline>
              )}
            </field.StepSequenceEditor>
          )}
        </form.AppField>
      </form.AppForm>
      <Stack gap={2}>
        <Text size="sm" color="muted">
          Standing alone, empty
        </Text>
        <StepSequenceEditor<Request>
          label="Actions"
          defaultValue={[]}
          min={0}
          emptyLabel="No actions yet."
          newStep={() => ({ name: "", method: "GET", url: "" })}
        >
          {(row) => (
            <Text size="sm">{`${row.value().method} ${row.value().url || "(no URL)"}`}</Text>
          )}
        </StepSequenceEditor>
      </Stack>
    </Stack>
  );
}
