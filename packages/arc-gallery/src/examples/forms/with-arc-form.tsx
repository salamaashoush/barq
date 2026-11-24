import { Grid, Heading, Stack, toast, useArcForm, withArcForm } from "@barqjs/arc";

const COUNTRIES = [
  { value: "EG", label: "Egypt" },
  { value: "DE", label: "Germany" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "US", label: "United States" },
];

const DEFAULTS = {
  billing: { street: "", city: "", country: "EG" as string | null },
  shipping: { street: "", city: "", country: "EG" as string | null },
};

/** One address section, written once and bound to either half of the form. */
const AddressFields = withArcForm({
  defaultValues: DEFAULTS,
  props: { heading: "Address", part: "billing" as "billing" | "shipping" },
  render: (props) => {
    const form = props.form();
    const part = props.part();
    return (
      <Stack gap={3}>
        <Heading level={3} size="sm">
          {props.heading()}
        </Heading>
        <form.AppField
          name={`${part}.street`}
          validators={{
            onBlur: ({ value }) => (value.trim() === "" ? "Enter a street" : undefined),
          }}
        >
          {(field) => <field.TextField label="Street" autoComplete={`${part} street-address`} />}
        </form.AppField>
        <Grid columns={{ base: 1, cqSm: 2 }} gap={3}>
          <form.AppField name={`${part}.city`}>
            {(field) => <field.TextField label="City" autoComplete={`${part} address-level2`} />}
          </form.AppField>
          <form.AppField name={`${part}.country`}>
            {(field) => <field.SelectField label="Country" options={COUNTRIES} />}
          </form.AppField>
        </Grid>
      </Stack>
    );
  },
});

export default function WithArcFormExample() {
  const form = useArcForm(() => ({
    defaultValues: DEFAULTS,
    onSubmit: async ({ value }) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      toast.success(`Addresses saved, shipping to ${value.shipping.city || "the billing city"}`);
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
        <Stack gap={6}>
          <Grid columns={{ base: 1, cqMd: 2 }} gap={6}>
            <AddressFields form={form} heading="Billing address" part="billing" />
            <AddressFields form={form} heading="Shipping address" part="shipping" />
          </Grid>
          <div>
            <form.SubmitButton>Save addresses</form.SubmitButton>
          </div>
        </Stack>
      </form>
    </form.AppForm>
  );
}
