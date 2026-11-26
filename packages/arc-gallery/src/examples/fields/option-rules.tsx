import { createSignal } from "@barqjs/core";
import {
  FieldRule,
  OptionGroup,
  Stack,
  SubmitButton,
  Text,
  fieldRules,
  setServerErrors,
  useArcForm,
} from "@barqjs/arc";

interface CheckValues {
  locations: string[];
  quorum: number | undefined;
  retries: number | undefined;
  retryDelay: number | undefined;
  proxy: string;
  userAgent: string;
}

const LOCATIONS = [
  { value: "eu-west", label: "Dublin" },
  { value: "eu-central", label: "Frankfurt" },
  { value: "me-central", label: "Bahrain" },
  { value: "us-east", label: "Virginia" },
];

const RULES = fieldRules<CheckValues>({
  quorum: {
    show: (values) => values.locations.length > 1,
    max: (values) => values.locations.length,
    describe: (values) => `Alert once this many of the ${String(values.locations.length)} agree.`,
  },
  retryDelay: {
    disable: (values) => ((values.retries ?? 0) === 0 ? "Set a retry first." : undefined),
  },
});

function networkSummary(values: CheckValues): string {
  const parts = [
    values.proxy === "" ? "" : `through ${values.proxy}`,
    values.userAgent === "" ? "" : `as ${values.userAgent}`,
  ].filter((part) => part !== "");
  return parts.length === 0 ? "Full speed, straight to the site" : parts.join(", ");
}

export default function OptionRules() {
  const [saved, setSaved] = createSignal("");
  const defaults: CheckValues = {
    locations: ["eu-west", "eu-central"],
    quorum: 2,
    retries: 0,
    retryDelay: 5,
    proxy: "",
    userAgent: "",
  };
  const form = useArcForm(() => ({
    defaultValues: defaults,
    onSubmit: ({ value, formApi }) => {
      if (value.proxy.startsWith("http://")) {
        setServerErrors(formApi, { fields: { proxy: "The proxy has to be reached over HTTPS." } });
        return;
      }
      setSaved(JSON.stringify(RULES.prune(value)));
    },
  }));
  const values = form.useSelector((state) => state.values);
  return (
    <form.AppForm>
      <form
        onSubmit={(event: Event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Stack gap={6}>
          <form.AppField name="locations">
            {(field) => (
              <field.CheckboxGroupField label="Locations" layout="row" options={LOCATIONS} />
            )}
          </form.AppField>
          <FieldRule rules={RULES} name="quorum">
            {(rule) => (
              <form.AppField name="quorum">
                {(field) => (
                  <field.NumberField
                    label="Quorum"
                    min={1}
                    max={rule().max}
                    description={rule().description}
                  />
                )}
              </form.AppField>
            )}
          </FieldRule>
          <form.AppField name="retries">
            {(field) => <field.NumberField label="Retries" min={0} max={5} />}
          </form.AppField>
          <FieldRule rules={RULES} name="retryDelay">
            {(rule) => (
              <form.AppField name="retryDelay">
                {(field) => (
                  <field.NumberField
                    label="Retry delay"
                    unit="s"
                    unitLabel="seconds"
                    isDisabled={rule().isDisabled}
                    description={rule().description}
                  />
                )}
              </form.AppField>
            )}
          </FieldRule>
          <OptionGroup
            title="Network"
            summary={networkSummary(values())}
            fields={["proxy", "userAgent"]}
          >
            <form.AppField name="proxy">
              {(field) => (
                <field.TextField
                  label="Proxy"
                  type="url"
                  placeholder="https://proxy.example.com"
                  description="Try an http:// address to see the group open on the error."
                />
              )}
            </form.AppField>
            <form.AppField name="userAgent">
              {(field) => <field.TextField label="User agent" />}
            </form.AppField>
          </OptionGroup>
          <SubmitButton>Save check</SubmitButton>
          <Text size="xs" color="muted">
            {saved() === "" ? "Saved values leave out what the rules hide." : saved()}
          </Text>
        </Stack>
      </form>
    </form.AppForm>
  );
}
